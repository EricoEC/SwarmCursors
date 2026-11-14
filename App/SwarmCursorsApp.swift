import SwiftUI

// One entry point for every platform now: the SwiftUI `App` protocol needs
// iOS 14 / macOS 11, and the floor is iOS 15 / macOS 11 / visionOS 1.0.
//
// The delegate + scene code that used to live here is gone with the iOS 13
// target. It also removes the reason visionOS needed a separate branch: the
// UIKit scene path activated but never presented a window there.

@main
struct SwarmCursorsApp: App {
    @StateObject private var settings = SwarmSettings()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(settings)
                .tintCompat(.swarmAccent)
                #if os(macOS)
                .frame(minWidth: 420, idealWidth: 480, minHeight: 600, idealHeight: 740)
                #endif
        }
        #if os(visionOS)
        .defaultSize(width: 580, height: 780)
        #endif
    }
}
