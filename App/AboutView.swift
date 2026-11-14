import SwiftUI

struct AboutView: View {
    @Environment(\.openURL) private var openURL

    /// Swap this one line for your own repository when you publish.
    private let repository = URL(string: "https://github.com/EricoEC/SwarmCursors")!

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "\(short) (\(build))"
    }

    private var versionLine: String {
        String(format: NSLocalizedString("about.version", comment: ""), version)
    }

    var body: some View {
        SwarmScroll {
            VStack(spacing: Layout.gap) {
                GlassCard {
                    VStack(alignment: .leading, spacing: 16) {
                        HStack(spacing: 14) {
                            Image(systemName: "square.grid.2x2")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundColor(Color.swarmAccent)
                                .frame(width: 52, height: 52)
                                .background(
                                    RoundedRectangle(cornerRadius: 15, style: .continuous)
                                        .fill(Color.swarmAccent.opacity(0.14))
                                )

                            VStack(alignment: .leading, spacing: 3) {
                                Text("hero.title")
                                    .font(.swarm(.headline, size: 17, weight: .semibold))
                                Text(versionLine)
                                    .font(.footnote.monospacedDigit())
                                    .foregroundColor(.secondary)
                            }

                            Spacer(minLength: 0)
                        }

                        Text("about.tagline")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                GlassGroup(spacing: 12) {
                    VStack(spacing: Layout.gap) {
                        card("person.2", "about.credit.title", "about.credit.body")
                        card("lock", "about.privacy.title", "about.privacy.body")
                    }
                }

                ProminentAction(action: {
                    openURL(repository) { accepted in
                        if !accepted {
                            openExternal(repository)
                        }
                    }
                }) {
                    HStack(spacing: 8) {
                        Image(systemName: "chevron.left.slash.chevron.right")
                        Text("about.github")
                    }
                    .font(.headline)
                }
                .padding(.top, 2)
            }
            .padding(.horizontal, Layout.pad)
            .padding(.vertical, Layout.pad)
            .contentColumn()
        }
        .swarmScreen()
    }

    private func card(
        _ symbol: String,
        _ titleKey: LocalizedStringKey,
        _ bodyKey: LocalizedStringKey
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(titleKey, systemImage: symbol)
                .font(.swarm(.subheadline, size: 15, weight: .semibold))
            Text(bodyKey)
                .font(.footnote)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .surface(Layout.rowRadius)
    }
}

/// The single prominent action on a screen. Uses the platform's own prominent
/// button when Liquid Glass exists, and a filled capsule below it — but never a
/// washed-out outline, which would read as secondary.
private struct ProminentAction<Content: View>: View {
    let action: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        #if os(visionOS)
        Button(action: action) {
            content.frame(maxWidth: .infinity)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        #else
        if #available(iOS 26.0, macOS 26.0, *) {
            Button(action: action) {
                content.frame(maxWidth: .infinity)
            }
            .buttonStyle(.glassProminent)
            .controlSize(.large)
        } else {
            Button(action: action) {
                content
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Capsule(style: .continuous).fill(Color.swarmAccent))
                    .foregroundColor(.white)
            }
            .buttonStyle(BorderlessButtonStyle())
        }
        #endif
    }
}
