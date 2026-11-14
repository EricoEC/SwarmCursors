import SwiftUI

// Design tokens for Swarm Cursors.
//
// Accent, radius family, and bottom ambient aurora lighting.
// The ambient light cycles gracefully through Green -> Blue -> Purple,
// defaulting to Green on app launch.

extension Color {
    /// #0D99FF — the blue the swarm's HUD uses, so app and page read as one thing.
    static let swarmAccent = Color(red: 13 / 255, green: 153 / 255, blue: 255 / 255)

    /// The three aurora ambient light hues: green (default), blue, and purple.
    static let swarmGreen = Color(red: 0.09, green: 0.65, blue: 0.42)
    static let swarmBlue = Color(red: 0.08, green: 0.58, blue: 0.98)
    static let swarmPurple = Color(red: 0.58, green: 0.35, blue: 0.96)
}

enum Layout {
    static let cardRadius: CGFloat = 26
    static let rowRadius: CGFloat = 22
    static let gap: CGFloat = 16
    static let pad: CGFloat = 20
    static let column: CGFloat = 560
}

/// A surface at the highest tier the OS supports, with consistent padding.
struct GlassCard<Content: View>: View {
    var radius: CGFloat = Layout.cardRadius
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(Layout.pad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .surface(radius)
    }
}

extension View {
    /// Caps a scrolling content column so rows don't stretch into ribbons on
    /// macOS and visionOS.
    func contentColumn(_ width: CGFloat = Layout.column) -> some View {
        frame(maxWidth: width)
            .frame(maxWidth: .infinity)
    }

    /// The ambient background, applied *inside* each tab.
    ///
    /// It cannot live at the root: a `TabView` paints its own opaque page
    /// backdrop, so an app-level layer behind it is simply covered (that is why
    /// the lights vanished on iOS). Every tab draws its own copy, and all copies
    /// read the one shared `AuroraState`, so the hue is global — one timer, three
    /// identical backgrounds, seamless when you switch tabs.
    func swarmScreen() -> some View {
        background(AuroraBackground())
    }
}

/// A vertical scroll that centres its content when there is room to spare.
///
/// On a tall Mac window a 640pt column glued to the top edge looks broken; this
/// keeps it optically centred and behaves like a normal scroll view as soon as
/// the content is taller than the window.
struct SwarmScroll<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        GeometryReader { geo in
            ScrollView(.vertical, showsIndicators: false) {
                content
                    .frame(maxWidth: .infinity)
                    .frame(minHeight: geo.size.height, alignment: .center)
            }
            .transparentScrolling()
        }
    }
}

/// Shared coordinator for the ambient bottom glow: cycles gently between
/// Green -> Blue -> Purple with a slow, hypnotic crossfade.
/// Guaranteed to start with Green (index 0) upon launch.
final class AuroraState: ObservableObject {
    static let shared = AuroraState()

    @Published var colorIndex: Int = 0

    private var timer: Timer?

    private init() {
        // Starts with index 0 (Green) on launch.
        // Every 5.5s, animate a 3.5s smooth crossfade to the next hue.
        timer = Timer.scheduledTimer(withTimeInterval: 5.5, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            withAnimation(.easeInOut(duration: 3.5)) {
                self.colorIndex = (self.colorIndex + 1) % 3
            }
        }
    }
}

/// Ambient light rising from the bottom edge, dimming as it rises.
///
/// Smoothly crossfades between Green (default), Blue, and Purple in a continuous loop.
struct AuroraBackground: View {
    @ObservedObject private var state = AuroraState.shared
    @Environment(\.colorScheme) private var scheme
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

    var body: some View {
        ZStack {
            base
            if !reduceTransparency {
                glowLayer
            }
        }
        .ignoresSafeArea()
    }

    private var base: Color {
        scheme == .dark
            ? Color(red: 0.043, green: 0.049, blue: 0.051)
            : Color(white: 0.976)
    }

    /// Materials are what make a strong field read as light. Without them the
    /// same numbers look like smeared paint, so each tier gets its own weight.
    private var strength: (top: Double, mid: Double, core: Double) {
        let glassy = Tier.surface == .glass
        switch scheme {
        case .dark:
            return glassy ? (0.58, 0.19, 0.42) : (0.34, 0.11, 0.24)
        default:
            return glassy ? (0.42, 0.12, 0.28) : (0.24, 0.07, 0.15)
        }
    }

    private var glowLayer: some View {
        ZStack {
            glow(color: .swarmGreen, offset: 0)
                .opacity(state.colorIndex == 0 ? 1 : 0)

            glow(color: .swarmBlue, offset: -0.04)
                .opacity(state.colorIndex == 1 ? 1 : 0)

            glow(color: .swarmPurple, offset: 0.04)
                .opacity(state.colorIndex == 2 ? 1 : 0)
        }
    }

    private func glow(color: Color, offset: CGFloat) -> some View {
        ZStack {
            LinearGradient(
                stops: [
                    .init(color: color.opacity(strength.top), location: 0.0),
                    .init(color: color.opacity(strength.mid), location: 0.44),
                    .init(color: color.opacity(0.0), location: 1.0)
                ],
                startPoint: .bottom,
                endPoint: .top
            )

            RadialGradient(
                colors: [
                    color.opacity(strength.core),
                    color.opacity(0.0)
                ],
                center: UnitPoint(x: 0.5 + offset, y: 1.03),
                startRadius: 0,
                endRadius: 380
            )
        }
    }
}
