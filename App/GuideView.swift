import SwiftUI
import SafariServices
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

/// Enablement instructions. Safari's extension UI is genuinely different on each
/// platform — macOS has no "Safari" pane in Settings, iOS has no ⌘, — so each
/// platform gets its own copy rather than one paragraph hedged into uselessness.
struct GuideView: View {
    var body: some View {
        SwarmScroll {
            VStack(spacing: Layout.gap) {
                GlassCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("guide.title")
                            .font(.swarmSectionTitle)
                        Text("guide.intro")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                // Action button to jump directly to Safari Extension settings
                openSettingsButton

                GlassGroup(spacing: 12) {
                    VStack(spacing: Layout.gap) {
                        ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                            stepRow(index + 1, step.titleKey, step.bodyKey)
                        }
                    }
                }

                shortcutCard

                Text("guide.tip")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 8)
                    .padding(.top, 2)
            }
            .padding(.horizontal, Layout.pad)
            .padding(.vertical, Layout.pad)
            .contentColumn()
        }
        .swarmScreen()
    }

    // MARK: - Open Settings Action

    private var openSettingsButton: some View {
        Button(action: openSafariSettings) {
            HStack(spacing: 10) {
                Image(systemName: "safari")
                    .font(.system(size: 17, weight: .semibold))
                Text("guide.openSettings")
                    .font(.swarm(.subheadline, size: 15, weight: .semibold))
                Spacer()
                Image(systemName: "arrow.up.forward.app")
                    .font(.footnote)
                    .foregroundColor(.white.opacity(0.8))
            }
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(
                Capsule(style: .continuous).fill(Color.swarmAccent)
            )
            .foregroundColor(.white)
        }
        .buttonStyle(BorderlessButtonStyle())
    }

    /// Intelligently navigates to Safari Extension Settings across iOS/iPadOS and macOS.
    ///
    /// Multi-tiered fallback strategy:
    /// - macOS: SFSafariApplication.showPreferencesForExtension (opens Safari Extensions directly)
    /// - iOS 18 ~ 26.1+: App-Prefs:com.apple.mobilesafari&path=WEB_EXTENSIONS -> App-Prefs:com.apple.mobilesafari
    /// - iOS 15 ~ 17: App-Prefs:Safari&path=WEB_EXTENSIONS -> App-Prefs:Safari
    /// - Fallback: UIApplication.openSettingsURLString
    private func openSafariSettings() {
        #if os(macOS)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.Erico.SwarmCursors.Extension") { _ in }
        #else
        let candidateSchemes: [String] = [
            // iOS 18 ~ 26.1 (modern bundle ID scheme)
            "App-Prefs:com.apple.mobilesafari&path=WEB_EXTENSIONS",
            "App-Prefs:com.apple.mobilesafari",
            "app-prefs:com.apple.mobilesafari&path=WEB_EXTENSIONS",
            "app-prefs:com.apple.mobilesafari",
            // iOS 15 ~ 17 (legacy service name scheme)
            "App-Prefs:Safari&path=WEB_EXTENSIONS",
            "App-Prefs:Safari",
            "app-prefs:Safari&path=WEB_EXTENSIONS",
            "app-prefs:Safari"
        ]

        for urlString in candidateSchemes {
            if let url = URL(string: urlString) {
                // In iOS, canOpenURL can return false for private URL schemes even though open(_:) succeeds.
                // We directly attempt to open the target extension URL.
                UIApplication.shared.open(url, options: [:]) { success in
                    if success { return }
                }
                return
            }
        }

        // Final safe fallback: app's own settings page
        if let fallback = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(fallback, options: [:], completionHandler: nil)
        }
        #endif
    }

    // MARK: - Per-platform steps

    private struct Step {
        let titleKey: String
        let bodyKey: String
    }

    private var steps: [Step] {
        #if os(macOS)
        return [
            Step(titleKey: "guide.mac.step1.title", bodyKey: "guide.mac.step1.body"),
            Step(titleKey: "guide.mac.step2.title", bodyKey: "guide.mac.step2.body"),
            Step(titleKey: "guide.mac.step3.title", bodyKey: "guide.mac.step3.body"),
            Step(titleKey: "guide.mac.step4.title", bodyKey: "guide.mac.step4.body")
        ]
        #elseif os(visionOS)
        return [
            Step(titleKey: "guide.vision.step1.title", bodyKey: "guide.vision.step1.body"),
            Step(titleKey: "guide.vision.step2.title", bodyKey: "guide.vision.step2.body"),
            Step(titleKey: "guide.vision.step3.title", bodyKey: "guide.vision.step3.body"),
            Step(titleKey: "guide.vision.step4.title", bodyKey: "guide.vision.step4.body")
        ]
        #else
        return [
            Step(titleKey: "guide.ios.step1.title", bodyKey: "guide.ios.step1.body"),
            Step(titleKey: "guide.ios.step2.title", bodyKey: "guide.ios.step2.body"),
            Step(titleKey: "guide.ios.step3.title", bodyKey: "guide.ios.step3.body"),
            Step(titleKey: "guide.ios.step4.title", bodyKey: "guide.ios.step4.body")
        ]
        #endif
    }

    private func stepRow(_ index: Int, _ titleKey: String, _ bodyKey: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Text("\(index)")
                .font(.swarm(.footnote, size: 13, weight: .bold).monospacedDigit())
                .foregroundColor(Color.swarmAccent)
                .frame(width: 26, height: 26)
                .background(
                    Circle().fill(Color.swarmAccent.opacity(0.15))
                )

            VStack(alignment: .leading, spacing: 3) {
                Text(NSLocalizedString(titleKey, comment: ""))
                    .font(.swarm(.subheadline, size: 15, weight: .semibold))
                Text(NSLocalizedString(bodyKey, comment: ""))
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .surface(Layout.rowRadius)
    }

    // MARK: - Shortcut

    @ViewBuilder
    private var shortcutCard: some View {
        #if os(macOS)
        HStack(spacing: 14) {
            Label("guide.shortcut.title", systemImage: "keyboard")
                .font(.body)
            Spacer(minLength: 8)
            HStack(spacing: 4) {
                keyCap("⌥")
                keyCap("⇧")
                keyCap("S")
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .surface(Layout.rowRadius)
        #endif
    }

    private func keyCap(_ label: String) -> some View {
        Text(label)
            .font(.swarm(.footnote, size: 13, weight: .semibold))
            .frame(minWidth: 24, minHeight: 24)
            .padding(.horizontal, 5)
            .background(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .fill(Color.primary.opacity(0.09))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .strokeBorder(Color.primary.opacity(0.08), lineWidth: 1)
            )
    }
}
