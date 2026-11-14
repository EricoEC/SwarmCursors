import SwiftUI

// MARK: - Capability ladder
//
// Deployment floor is iOS 15 / macOS 11 / visionOS 1.0. That is the floor, not
// the target: every capability is picked at runtime at its own highest available
// tier, so an iOS 15 device keeps its materials and an iOS 26 device gets Liquid
// Glass with grouping and morphing.
//
// One question per capability, never one version check for the whole app.

enum Tier {

    /// Ordered surface ladder. Each step is a real material, not a fallback hack.
    enum Surface: Int {
        case flat = 0      // macOS 11 only — materials start at 12
        case material = 1  // iOS 15+, macOS 12+
        case glass = 2     // iOS 26+, macOS 26+, visionOS 1+ (native glass)
    }

    static var surface: Surface {
        #if os(visionOS)
        // visionOS has carried its own window material since 1.0; that *is* the
        // top tier there.
        return .glass
        #else
        if #available(iOS 26.0, macOS 26.0, *) { return .glass }
        if #available(iOS 15.0, macOS 12.0, *) { return .material }
        return .flat
        #endif
    }

    /// `GlassEffectContainer` / `glassEffectID` ship with `glassEffect`, which
    /// visionOS does not have — it uses `glassBackgroundEffect` instead.
    static var morphsGlass: Bool {
        #if os(visionOS)
        return false
        #else
        if #available(iOS 26.0, macOS 26.0, *) { return true }
        return false
        #endif
    }

    static var numericText: Bool {
        if #available(iOS 16.0, macOS 13.0, *) { return true }
        return false
    }

    static var symbolEffects: Bool {
        if #available(iOS 17.0, macOS 14.0, *) { return true }
        return false
    }

    static var sensoryFeedback: Bool {
        if #available(iOS 17.0, macOS 14.0, visionOS 26.0, *) { return true }
        return false
    }

    static var tabBarMinimize: Bool {
        #if os(iOS)
        if #available(iOS 26.0, *) { return true }
        #endif
        return false
    }
}

// MARK: - Surfaces

extension View {
    /// Applies the highest-tier surface this OS knows about.
    @ViewBuilder
    func surface(_ radius: CGFloat, interactive: Bool = false) -> some View {
        #if os(visionOS)
        self.glassBackgroundEffect(
            in: RoundedRectangle(cornerRadius: radius, style: .continuous)
        )
        #else
        if #available(iOS 26.0, macOS 26.0, *) {
            // Liquid Glass refracts what is behind it, so it needs no shadow.
            self.glassEffect(
                interactive ? .regular.interactive() : .regular,
                in: RoundedRectangle(cornerRadius: radius, style: .continuous)
            )
        } else if #available(iOS 15.0, macOS 12.0, *) {
            self
                .background(
                    .ultraThinMaterial,
                    in: RoundedRectangle(cornerRadius: radius, style: .continuous)
                )
                .shadow(color: Color.black.opacity(0.07), radius: 10, x: 0, y: 4)
        } else {
            // macOS 11: no materials yet, so fake depth with a tint and a hairline.
            self
                .background(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .fill(Color.primary.opacity(0.055))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: radius, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.07), lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.06), radius: 8, x: 0, y: 3)
        }
        #endif
    }
}

/// Groups neighbouring glass shapes for blending and morphing. A no-op below
/// iOS 26 — there the rows are independent surfaces, which is the correct look
/// for a material card list.
struct GlassGroup<Content: View>: View {
    var spacing: CGFloat
    @ViewBuilder var content: Content

    var body: some View {
        #if os(visionOS)
        content
        #else
        if #available(iOS 26.0, macOS 26.0, *) {
            GlassEffectContainer(spacing: spacing) { content }
        } else {
            content
        }
        #endif
    }
}

// MARK: - Transitions, feedback, tints

extension View {
    /// Animated digit roll-in, iOS 16+. Below that the number just changes,
    /// which is the platform's own behaviour anyway.
    @ViewBuilder
    func numericRoll(_ on: Bool = true) -> some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            self.contentTransition(on ? .numericText() : .identity)
        } else {
            self
        }
    }

    /// Symbol replacement animation, iOS 17+.
    @ViewBuilder
    func symbolSwitch(_ on: Bool = true) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            self.contentTransition(.symbolEffect(.replace))
        } else {
            self
        }
    }

    /// `.tint` is iOS 15 / macOS 12; macOS 11 still needs `accentColor`.
    @ViewBuilder
    func tintCompat(_ color: Color) -> some View {
        if #available(iOS 15.0, macOS 12.0, *) {
            self.tint(color)
        } else {
            self.accentColor(color)
        }
    }

    /// Haptics: the SwiftUI modifier on 17+, the feedback generator below it.
    @ViewBuilder
    func selectionHaptic<T: Equatable>(_ value: T) -> some View {
        if #available(iOS 17.0, macOS 14.0, visionOS 26.0, *) {
            self.sensoryFeedback(.selection, trigger: value)
        } else {
            self.onChange(of: value) { _ in Haptics.selection() }
        }
    }

    /// Transparent scroll content background across platforms so unified Aurora background shows through seamlessly.
    @ViewBuilder
    func transparentScrolling() -> some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            self.scrollContentBackground(.hidden)
        } else {
            self
        }
    }
}

enum Haptics {
    static func selection() {
        #if os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }
}

// MARK: - Symbol swap

/// Two glyphs that trade places with the best animation the OS knows.
///
/// iOS 17+ gets the real thing: `.contentTransition(.symbolEffect(.replace))`,
/// where the outgoing symbol is drawn off and the incoming one drawn on — a
/// morph, not a crossfade. Below 17 there is no content transition for images,
/// so the same moment is staged by hand: both glyphs live in a ZStack and
/// cross-fade with a small scale pop, which reads as one glyph replacing the
/// other rather than two images blinking. Every tier animates; none is a jump cut.
struct SymbolSwap: View {
    var isOn: Bool
    var onName: String
    var offName: String
    var size: CGFloat = 17

    var body: some View {
        Group {
            if #available(iOS 17.0, macOS 14.0, *) {
                // Haiku tier: hand the whole job to the symbol animation engine.
                Image(systemName: isOn ? onName : offName)
                    .contentTransition(.symbolEffect(.replace))
            } else {
                // Manual tier: cross-fade the pair inside a fixed frame so the
                // row never reflows mid-swap.
                ZStack {
                    Image(systemName: onName)
                        .opacity(isOn ? 1 : 0)
                        .scaleEffect(isOn ? 1 : 0.82)
                    Image(systemName: offName)
                        .opacity(isOn ? 0 : 1)
                        .scaleEffect(isOn ? 0.82 : 1)
                }
            }
        }
        .font(.system(size: size, weight: .regular))
        .frame(width: size + 7, height: size + 4)
        .animation(.spring(response: 0.3, dampingFraction: 0.82), value: isOn)
        .accessibilityHidden(true)
    }
}

extension Font {
    /// Semantic text style with a design and weight where the OS has it (so
    /// Dynamic Type keeps working), fixed point size below that. iOS 16 gates
    /// `system(_:design:weight:)`; the size-based initialiser is older.
    static func swarm(
        _ style: Font.TextStyle,
        size: CGFloat,
        weight: Font.Weight = .regular,
        design: Font.Design = .rounded
    ) -> Font {
        if #available(iOS 16.0, macOS 13.0, *) {
            return .system(style, design: design, weight: weight)
        }
        return .system(size: size, weight: weight, design: design)
    }

    /// Section title. Both gates at once: `.title2` is iOS 14, the
    /// design/weight initialiser it is used with is iOS 16.
    static var swarmSectionTitle: Font {
        if #available(iOS 16.0, macOS 13.0, *) {
            return .system(.title2, design: .rounded, weight: .semibold)
        }
        return .system(size: 22, weight: .semibold, design: .rounded)
    }
}

/// Opens a URL with whatever the platform calls a browser.
func openExternal(_ url: URL) {
    #if os(macOS)
    NSWorkspace.shared.open(url)
    #else
    UIApplication.shared.open(url, options: [:], completionHandler: nil)
    #endif
}
