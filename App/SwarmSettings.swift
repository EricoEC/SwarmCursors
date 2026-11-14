import Foundation
import Combine
import os.log
#if os(macOS)
import SafariServices
#endif

/// Whether this build can actually reach the shared App Group container.
///
/// The entitlement in the entitlements file is only a *request*: the sandbox
/// also needs the provisioning profile that signed the bundle to carry the
/// group. Development builds happily fall back to the team's wildcard profile
/// (`Q42CQ5VP5A.*`), which cannot carry capabilities, so the container is
/// refused at run time — and *that* refusal is what makes macOS put up
/// “Swarm Cursors wants to access data from other apps” and what fills the
/// console with `CFPrefsPlistSource … requires user-preference-read` denials.
///
/// Asking cfprefsd / containermanagerd about a group we are not entitled to is
/// the whole problem, so the check has to happen *before* the first request,
/// and it has to be a plain local file read: the embedded profile lives in our
/// own bundle, reading it prompts for nothing.
enum SharedContainer {

    static let group = "group.com.Erico.SwarmCursors"

    /// True only when the profiles that signed this bundle list the group.
    static let granted: Bool = {
        #if os(macOS)
        let profiles = ["embedded.provisionprofile"]
        #else
        let profiles = ["embedded.mobileprovision"]
        #endif
        let needle = Data(group.utf8)
        for name in profiles {
            let base = (name as NSString).deletingPathExtension
            let ext = (name as NSString).pathExtension
            guard let url = Bundle.main.url(forResource: base, withExtension: ext),
                  let data = try? Data(contentsOf: url) else { continue }
            // The profile is CMS-signed but its plist payload is not encrypted,
            // so the entitlement strings are present verbatim.
            if data.range(of: needle) != nil { return true }
        }
        return false
    }()

    static var defaults: UserDefaults? {
        granted ? UserDefaults(suiteName: group) : nil
    }

    static var url: URL? {
        granted ? FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) : nil
    }
}

/// Settings shared with the Safari Web Extension.
///
/// Delivery is layered, and every layer is free of prompts:
/// 1. App Group (iOS, where the profile is authorised) — the canonical store.
/// 2. On macOS the group is usually *not* authorised for local builds, so the
///    app talks to the extension over `SFSafariApplication.dispatchMessage`
///    instead: a direct app→extension message, no shared container involved.
/// 3. Whatever happens, the app keeps its own copy in standard defaults so the
///    UI is never wrong about its own state.
final class SwarmSettings: ObservableObject {

    static let appGroup = SharedContainer.group
    static let extensionID = "com.Erico.SwarmCursors.Extension"

    private var enabledUpdatedAt: Double = 0
    private var settingsUpdatedAt: Double = 0
    private var applyingRemote = false
    private var refreshTimer: AnyCancellable?
    #if os(macOS)
    private var stateObserver: NSObjectProtocol?
    private var requestObserver: NSObjectProtocol?
    #endif
    private let store: UserDefaults
    private let log = Logger(subsystem: "com.Erico.SwarmCursors", category: "settings")

    @Published var speed: Int {
        didSet { settingsUpdatedAt = max(Date().timeIntervalSince1970 * 1000, settingsUpdatedAt + 1); persist() }
    }

    /// Whether cursor count is determined automatically or manually by the slider.
    /// Defaults to true (Automatic).
    @Published var autoAgents: Bool {
        didSet { settingsUpdatedAt = max(Date().timeIntervalSince1970 * 1000, settingsUpdatedAt + 1); persist() }
    }

    @Published var agents: Int {
        didSet { settingsUpdatedAt = max(Date().timeIntervalSince1970 * 1000, settingsUpdatedAt + 1); persist() }
    }

    @Published var sound: Bool {
        didSet { settingsUpdatedAt = max(Date().timeIntervalSince1970 * 1000, settingsUpdatedAt + 1); persist() }
    }

    /// Master switch, shared with the toolbar button. Off means the extension
    /// does nothing anywhere; on means every page gets drawn.
    @Published var enabled: Bool {
        didSet {
            guard oldValue != enabled else { return }
            if !applyingRemote { enabledUpdatedAt = max(Date().timeIntervalSince1970 * 1000, enabledUpdatedAt + 1) }
            persist()
        }
    }

    init() {
        // Read from the group when it is real, otherwise from our own defaults.
        // Never *ask* for the group when it is not granted.
        let resolved = SharedContainer.defaults ?? .standard
        self.store = resolved

        let storedSpeed = resolved.object(forKey: "speed") as? Int
        let storedAutoAgents = resolved.object(forKey: "autoAgents") as? Bool
        let storedAgents = resolved.object(forKey: "agents") as? Int
        let storedSound = resolved.object(forKey: "sound") as? Bool
        let storedEnabled = resolved.object(forKey: "enabled") as? Bool

        speed = [1, 2, 3].contains(storedSpeed ?? 0) ? (storedSpeed ?? 1) : 1
        autoAgents = storedAutoAgents ?? true
        agents = min(100, max(6, storedAgents ?? 24))
        sound = storedSound ?? true
        enabled = storedEnabled ?? true
        enabledUpdatedAt = resolved.double(forKey: "enabledUpdatedAt")
        settingsUpdatedAt = resolved.double(forKey: "settingsUpdatedAt")

        if !SharedContainer.granted {
            log.notice("App Group not in this build's profile — using app-local defaults and the direct message bridge.")
        }
        #if os(macOS)
        requestObserver = DistributedNotificationCenter.default().addObserver(
            forName: Notification.Name("com.Erico.SwarmCursors.settingsRequest"), object: nil, queue: .main
        ) { [weak self] note in
            guard let self, let requestID = note.object as? String,
                  let data = try? JSONSerialization.data(withJSONObject: ["requestID": requestID, "settings": self.payload]),
                  let object = String(data: data, encoding: .utf8) else { return }
            DistributedNotificationCenter.default().postNotificationName(
                Notification.Name("com.Erico.SwarmCursors.settingsResponse"), object: object, userInfo: nil, deliverImmediately: true)
        }
        stateObserver = DistributedNotificationCenter.default().addObserver(
            forName: Notification.Name("com.Erico.SwarmCursors.enabledChanged"), object: nil, queue: .main
        ) { [weak self] note in
            guard let object = note.object as? String, let data = object.data(using: .utf8),
                  let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
            self?.applyRemoteState(state)
        }
        #endif
        refreshTimer = Timer.publish(every: 1, on: .main, in: .common).autoconnect().sink { [weak self] _ in
            self?.refreshSharedState()
        }
        refreshSharedState()
        persist()
    }

    deinit {
        #if os(macOS)
        if let stateObserver { DistributedNotificationCenter.default().removeObserver(stateObserver) }
        if let requestObserver { DistributedNotificationCenter.default().removeObserver(requestObserver) }
        #endif
    }

    private func refreshSharedState() {
        guard let url = SharedContainer.url?.appendingPathComponent("swarm_settings.json"),
              let data = try? Data(contentsOf: url),
              let state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
        applyRemoteState(state)
    }

    private func applyRemoteState(_ state: [String: Any]) {
        guard let next = state["enabled"] as? Bool,
              let revision = state["enabledUpdatedAt"] as? Double, revision > enabledUpdatedAt else { return }
        enabledUpdatedAt = revision
        applyingRemote = true
        if enabled != next { enabled = next } else { persist() }
        applyingRemote = false
    }

    var payload: [String: Any] {
        [
            "speed": speed,
            "autoAgents": autoAgents,
            "agents": agents,
            "sound": sound,
            "lang": AppLanguage.resolved,
            "enabled": enabled,
            "enabledUpdatedAt": enabledUpdatedAt,
            "settingsUpdatedAt": settingsUpdatedAt
        ]
    }

    private func persist() {
        store.set(speed, forKey: "speed")
        store.set(autoAgents, forKey: "autoAgents")
        store.set(agents, forKey: "agents")
        store.set(sound, forKey: "sound")
        store.set(AppLanguage.resolved, forKey: "lang")
        store.set(enabled, forKey: "enabled")
        store.set(enabledUpdatedAt, forKey: "enabledUpdatedAt")
        store.set(settingsUpdatedAt, forKey: "settingsUpdatedAt")

        // Keep the app's own copy authoritative even when the group exists, so
        // a build without the capability still remembers what the user chose.
        if store !== UserDefaults.standard {
            UserDefaults.standard.set(speed, forKey: "speed")
            UserDefaults.standard.set(autoAgents, forKey: "autoAgents")
            UserDefaults.standard.set(agents, forKey: "agents")
            UserDefaults.standard.set(sound, forKey: "sound")
            UserDefaults.standard.set(AppLanguage.resolved, forKey: "lang")
            UserDefaults.standard.set(enabled, forKey: "enabled")
            UserDefaults.standard.set(enabledUpdatedAt, forKey: "enabledUpdatedAt")
            UserDefaults.standard.set(settingsUpdatedAt, forKey: "settingsUpdatedAt")
        }

        syncToSharedFile()
        if !applyingRemote { pushToExtension() }
    }

    /// Plain file I/O inside the group container. Only touched when the group is
    /// authorised — the `containerURL` call itself is what triggers the macOS
    /// “access data from other apps” prompt on an unauthorised build.
    private func syncToSharedFile() {
        guard let groupURL = SharedContainer.url else { return }
        let settingsFile = groupURL.appendingPathComponent("swarm_settings.json")
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
        try? data.write(to: settingsFile, options: .atomic)
    }

    /// macOS: app → extension, straight through SafariServices.
    ///
    /// This is the dedicated channel the user asked for: no App Group, no
    /// shared container, no permission dialog. iOS keeps the group because it
    /// works there and it survives the app being closed.
    private func pushToExtension() {
        #if os(macOS)
        SFSafariApplication.dispatchMessage(
            withName: "swarm:settings",
            toExtensionWithIdentifier: Self.extensionID,
            userInfo: payload
        ) { [log] error in
            if let error = error {
                log.debug("dispatchMessage failed: \(error.localizedDescription, privacy: .public)")
            }
        }
        #endif
    }
}

/// The language this app is actually running in.
///
/// The system's per-app language override works by rewriting the app's own
/// preferred localizations, so `Bundle.main` is the correct source here —
/// `Locale.current` would report the device language and ignore the override.
enum AppLanguage {
    static var resolved: String {
        Bundle.main.preferredLocalizations.first ?? "en"
    }
}

extension SwarmSettings {
    /// Mirrors the mapping in background.js so the app's copy matches what the
    /// page will actually spawn.
    var derivedMinAgents: Int {
        if autoAgents {
            return 2
        }
        return agents
    }
}
