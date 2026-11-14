//
//  SafariWebExtensionHandler.swift
//  Swarm Cursors
//
//  Native side of the settings bridge. background.js calls
//  `browser.runtime.sendNativeMessage("application.id", { type: "settings" })`
//  and gets the app's current settings back.
//
//  Where those values live depends on what this build is allowed to touch:
//
//  - iOS: the App Group the app writes (`swarm_settings.json`, and the group
//    UserDefaults as a fallback).
//  - macOS: local builds are signed with the team's wildcard profile, which
//    cannot carry the app-group capability. Asking for the group container in
//    that state is what produces `CFPrefsPlistSource … requires
//    user-preference-read` spam and a “wants to access data from other apps”
//    dialog, so we check the embedded profile first and simply do not ask.
//    On macOS the app pushes settings through SafariServices instead, and
//    background.js caches them.
//

import Foundation
import SafariServices
import os.log

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    private static let stateLock = NSLock()
    private let appGroup = "group.com.Erico.SwarmCursors"

    func beginRequest(with context: NSExtensionContext) {
        let request = context.inputItems.first as? NSExtensionItem

        var message: [String: Any] = [:]
        if let sfMessage = request?.userInfo?[SFExtensionMessageKey] as? [String: Any] {
            message = sfMessage
        } else if let legacyMessage = request?.userInfo?["message"] as? [String: Any] {
            message = legacyMessage
        }

        #if os(macOS)
        if (message["type"] as? String) == "settings" {
            let requestMessage = message
            requestRunningApp { settings in self.reply(requestMessage, context: context, appSettings: settings) }
            return
        }
        #endif
        reply(message, context: context, appSettings: nil)
    }

    private func reply(_ message: [String: Any], context: NSExtensionContext, appSettings: [String: Any]?) {
        Self.stateLock.lock()
        defer { Self.stateLock.unlock() }
        var payload: [String: Any] = [:]


        if (message["type"] as? String) == "setEnabled",
           let enabled = message["enabled"] as? Bool,
           let revision = message["enabledUpdatedAt"] as? Double {
            let local = UserDefaults.standard
            var shared: [String: Any] = [:]
            let file = sharedGroupURL()?.appendingPathComponent("swarm_settings.json")
            if let file, let data = try? Data(contentsOf: file),
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { shared = json }
            let latest = max(local.double(forKey: "enabledUpdatedAt"), shared["enabledUpdatedAt"] as? Double ?? 0)
            if revision >= latest {
                local.set(enabled, forKey: "enabled")
                local.set(revision, forKey: "enabledUpdatedAt")
                if let file {
                    shared["enabled"] = enabled; shared["enabledUpdatedAt"] = revision
                    if let data = try? JSONSerialization.data(withJSONObject: shared) { try? data.write(to: file, options: .atomic) }
                    if let defaults = UserDefaults(suiteName: appGroup) {
                        defaults.set(enabled, forKey: "enabled"); defaults.set(revision, forKey: "enabledUpdatedAt")
                    }
                }
            }
        }
        // Read canonical shared settings or the extension's persisted switch.

        if message.isEmpty || ["settings", "setEnabled"].contains(message["type"] as? String ?? "") {
            // Priority 1: the shared JSON file, when this build may read it.
            if let groupURL = sharedGroupURL() {
                let settingsFile = groupURL.appendingPathComponent("swarm_settings.json")
                if let data = try? Data(contentsOf: settingsFile),
                   let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    payload = json
                }
            }

            // Priority 2: App Group UserDefaults, same gate.
            if payload.isEmpty, sharedGroupURL() != nil,
               let groupDefaults = UserDefaults(suiteName: appGroup) {
                payload["speed"] = groupDefaults.object(forKey: "speed") as? Int ?? 1
                payload["agents"] = groupDefaults.object(forKey: "agents") as? Int ?? 24
                payload["autoAgents"] = groupDefaults.object(forKey: "autoAgents") as? Bool ?? true
                payload["sound"] = groupDefaults.object(forKey: "sound") as? Bool ?? true
                payload["enabled"] = groupDefaults.object(forKey: "enabled") as? Bool ?? true
                payload["enabledUpdatedAt"] = groupDefaults.double(forKey: "enabledUpdatedAt")
                let stored = groupDefaults.string(forKey: "lang")
                payload["lang"] = (stored?.isEmpty == false) ? stored! : Self.preferredLanguage
            }

            let local = UserDefaults.standard
            var cached = local.dictionary(forKey: "swarmFullSettings") ?? [:]
            for candidate in [payload, appSettings ?? [:]] {
                let revision = candidate["settingsUpdatedAt"] as? Double ?? 0
                if candidate["speed"] != nil && (cached.isEmpty || revision >= (cached["settingsUpdatedAt"] as? Double ?? 0)) {
                    for key in ["speed", "agents", "autoAgents", "sound", "lang", "settingsUpdatedAt"] { cached[key] = candidate[key] }
                }
                if let enabled = candidate["enabled"] as? Bool,
                   let stamp = candidate["enabledUpdatedAt"] as? Double,
                   local.object(forKey: "enabled") == nil || stamp > local.double(forKey: "enabledUpdatedAt") {
                    local.set(enabled, forKey: "enabled"); local.set(stamp, forKey: "enabledUpdatedAt")
                }
            }
            local.set(cached, forKey: "swarmFullSettings")
            payload = cached.merging(payload) { cache, shared in cache }
            let localRevision = local.double(forKey: "enabledUpdatedAt")
            if local.object(forKey: "enabled") != nil,
               localRevision >= (payload["enabledUpdatedAt"] as? Double ?? 0) {
                payload["enabled"] = local.bool(forKey: "enabled")
                payload["enabledUpdatedAt"] = localRevision
            }
        }
        #if os(macOS)
        // Sandboxed distributed notifications carry the state in the object;
        // userInfo remains nil. The app does not need cross-container access.
        if payload["enabled"] != nil,
           let data = try? JSONSerialization.data(withJSONObject: [
                "enabled": payload["enabled"]!, "enabledUpdatedAt": payload["enabledUpdatedAt"] ?? 0
           ]), let object = String(data: data, encoding: .utf8) {
            DistributedNotificationCenter.default().postNotificationName(
                Notification.Name("com.Erico.SwarmCursors.enabledChanged"),
                object: object, userInfo: nil, deliverImmediately: true)
        }
        #endif

        payload["bridgeSource"] = appSettings != nil ? "runningApp" : (sharedGroupURL() != nil ? "shared" : "cache")
        os_log(.default, "swarm: settings reply source=%{public}@", payload["bridgeSource"] as? String ?? "unknown")

        let response = NSExtensionItem()
        response.userInfo = [
            SFExtensionMessageKey: payload
        ]

        context.completeRequest(returningItems: [response], completionHandler: nil)
    }

    #if os(macOS)
    private func requestRunningApp(_ completion: @escaping ([String: Any]?) -> Void) {
        let center = DistributedNotificationCenter.default()
        let requestID = UUID().uuidString
        var observer: NSObjectProtocol?
        var completed = false
        let finish: ([String: Any]?) -> Void = { settings in
            guard !completed else { return }; completed = true
            if let observer { center.removeObserver(observer) }
            completion(settings)
        }
        observer = center.addObserver(forName: Notification.Name("com.Erico.SwarmCursors.settingsResponse"), object: nil, queue: .main) { note in
            guard let object = note.object as? String, let data = object.data(using: .utf8),
                  let response = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  response["requestID"] as? String == requestID,
                  let settings = response["settings"] as? [String: Any] else { return }
            finish(settings)
        }
        center.postNotificationName(Notification.Name("com.Erico.SwarmCursors.settingsRequest"), object: requestID, userInfo: nil, deliverImmediately: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { finish(nil) }
    }
    #endif

    /// The App Group container — only if this bundle's provisioning profile
    /// actually authorises it. Reading our own embedded profile is free; asking
    /// containermanagerd for a group we are not entitled to is not.
    private func sharedGroupURL() -> URL? {
        guard profileGrantsGroup else { return nil }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroup)
    }

    private lazy var profileGrantsGroup: Bool = {
        #if os(macOS)
        let names = ["embedded.provisionprofile"]
        #else
        let names = ["embedded.mobileprovision"]
        #endif
        let needle = Data(appGroup.utf8)
        let bundle = Bundle(for: SafariWebExtensionHandler.self)
        for name in names {
            let base = (name as NSString).deletingPathExtension
            let ext = (name as NSString).pathExtension
            guard let url = bundle.url(forResource: base, withExtension: ext),
                  let data = try? Data(contentsOf: url) else { continue }
            if data.range(of: needle) != nil { return true }
        }
        return false
    }()

    private static var preferredLanguage: String {
        if #available(iOS 16.0, macOS 13.0, visionOS 1.0, *) {
            return Locale.current.identifier(.bcp47)
        }
        return Locale.preferredLanguages.first ?? "en"
    }
}
