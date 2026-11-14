import SwiftUI

struct RootView: View {
    var body: some View {
        #if os(iOS)
        if #available(iOS 26.0, *) {
            tabs.tabBarMinimizeBehavior(.onScrollDown)
        } else {
            tabs
        }
        #else
        tabs
        #endif
    }

    private var tabs: some View {
        TabView {
            StudioView()
                .tabItem {
                    Image(systemName: "square.grid.2x2")
                    Text("nav.studio")
                }

            GuideView()
                .tabItem {
                    Image(systemName: "questionmark.circle")
                    Text("nav.guide")
                }

            AboutView()
                .tabItem {
                    Image(systemName: "info.circle")
                    Text("nav.about")
                }
        }
    }
}
