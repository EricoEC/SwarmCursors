import SwiftUI

struct StudioView: View {
    @EnvironmentObject private var settings: SwarmSettings

    private var autoAgentsBinding: Binding<Bool> {
        Binding(
            get: { settings.autoAgents },
            set: { settings.autoAgents = $0 }
        )
    }

    private var agentsBinding: Binding<Double> {
        Binding(
            get: { Double(settings.agents) },
            set: { settings.agents = Int($0.rounded()) }
        )
    }

    private var enabledBinding: Binding<Bool> {
        Binding(
            get: { settings.enabled },
            set: { settings.enabled = $0 }
        )
    }

    private var soundBinding: Binding<Bool> {
        Binding(
            get: { settings.sound },
            set: { settings.sound = $0 }
        )
    }

    var body: some View {
        SwarmScroll {
            VStack(spacing: Layout.gap) {
                hero

                GlassGroup(spacing: 12) {
                    VStack(spacing: Layout.gap) {
                        masterRow
                        speedRow
                        agentsRow
                        soundRow
                    }
                }

                Text("studio.footer")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 4)
                    .padding(.horizontal, 8)
            }
            .padding(.horizontal, Layout.pad)
            .padding(.vertical, Layout.pad)
            .contentColumn()
        }
        .selectionHaptic(settings.speed)
        .selectionHaptic(settings.agents)
        .swarmScreen()
    }

    // MARK: - Hero

    private var hero: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 16) {
                PreviewWebView(
                    speed: settings.speed,
                    agents: settings.autoAgents ? 4 : settings.agents,
                    sound: settings.sound
                )
                    .frame(maxWidth: .infinity)
                    .frame(height: 180)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(Color.primary.opacity(0.07), lineWidth: 1)
                    )

                VStack(alignment: .leading, spacing: 5) {
                    Text("hero.title")
                        .font(.swarmSectionTitle)
                    Text("hero.subtitle")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    // MARK: - Rows

    /// Master switch. Mirrors the toolbar button: off = the extension does
    /// nothing on any site, on = every page gets drawn.
    private var masterRow: some View {
        Toggle(isOn: enabledBinding) {
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text("studio.master.title")
                        .font(.body)
                    Text("studio.master.body")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            } icon: {
                Image(systemName: settings.enabled ? "sparkles" : "pause.circle")
            }
        }
        .tintCompat(.swarmAccent)
        .rowSurface()
    }

    private var speedRow: some View {
        HStack(spacing: 14) {
            Label("studio.speed.title", systemImage: "speedometer")
                .font(.body)

            Spacer(minLength: 8)

            HStack(spacing: 4) {
                ForEach([1, 2, 3], id: \.self) { value in
                    Button {
                        settings.speed = value
                    } label: {
                        Text("\(value)×")
                            .font(.swarm(.subheadline, size: 15, weight: .semibold))
                            .frame(width: 36, height: 28)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(BorderlessButtonStyle())
                    .foregroundColor(settings.speed == value ? .white : Color.primary.opacity(0.6))
                    .background(
                        Group {
                            if settings.speed == value {
                                Capsule(style: .continuous).fill(Color.swarmAccent)
                            } else {
                                Color.clear
                            }
                        }
                    )
                    .clipShape(Capsule(style: .continuous))
                }
            }
            .animation(.easeOut(duration: 0.2))
        }
        .rowSurface()
    }

    private var agentsRow: some View {
        VStack(alignment: .leading, spacing: 14) {
            Toggle(isOn: autoAgentsBinding.animation(.spring(response: 0.35, dampingFraction: 0.8))) {
                HStack(spacing: 14) {
                    Label("studio.agents.auto", systemImage: "sparkles")
                        .font(.body)
                }
            }
            .tintCompat(.swarmAccent)

            if !settings.autoAgents {
                VStack(alignment: .leading, spacing: 10) {
                    Divider()
                        .opacity(0.12)
                        .padding(.vertical, 2)

                    HStack(spacing: 14) {
                        Label("studio.agents.title", systemImage: "person.3")
                            .font(.body)

                        Spacer(minLength: 8)

                        Text("\(settings.agents)")
                            .font(.swarm(.body, size: 17, weight: .semibold).monospacedDigit())
                            .numericRoll()
                    }

                    Slider(value: agentsBinding, in: 6...100, step: 1)
                        .tintCompat(.swarmAccent)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .rowSurface()
    }

    private var soundRow: some View {
        Toggle(isOn: soundBinding) {
            Label {
                Text("studio.sound.title")
                    .font(.body)
            } icon: {
                // Speaker ↔ muted, with the v0.1 replace animation restored and a
                // hand-staged crossfade on the systems that lack symbol effects.
                SymbolSwap(
                    isOn: settings.sound,
                    onName: "speaker.wave.2",
                    offName: "speaker.slash"
                )
            }
        }
        .tintCompat(.swarmAccent)
        .rowSurface()
    }
}

/// Shared row treatment so every settings row lands on the same surface at the
/// same tier.
private extension View {
    func rowSurface() -> some View {
        self
            .padding(.horizontal, 18)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .surface(Layout.rowRadius)
    }
}
