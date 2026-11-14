import SwiftUI
import WebKit

/// Hosts the bundled miniature of the real effect: a genuine mini webpage
/// being constructed in real-time by a swarm of collaborative cursors.
///
/// WebKit hosts the live DOM, styles, and animation engine rather than an
/// approximation Canvas, faithfully mirroring how the extension runs on a real webpage.
struct PreviewWebView: View {
    var speed: Int = 2
    var agents: Int = 20
    var sound: Bool = false

    var body: some View {
        PreviewContainer(speed: speed, agents: agents, sound: sound)
    }
}

#if os(macOS)
private struct PreviewContainer: NSViewRepresentable {
    let speed: Int
    let agents: Int
    let sound: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(speed: speed, agents: agents, sound: sound)
    }

    func makeNSView(context: Context) -> WKWebView {
        let webView = PreviewFactory.make()
        context.coordinator.attach(to: webView)
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {
        context.coordinator.update(speed: speed, agents: agents, sound: sound, in: nsView)
    }
}
#else
private struct PreviewContainer: UIViewRepresentable {
    let speed: Int
    let agents: Int
    let sound: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(speed: speed, agents: agents, sound: sound)
    }

    func makeUIView(context: Context) -> WKWebView {
        let webView = PreviewFactory.make()
        context.coordinator.attach(to: webView)
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        context.coordinator.update(speed: speed, agents: agents, sound: sound, in: uiView)
    }
}
#endif

private final class Coordinator: NSObject, WKNavigationDelegate {
    var speed: Int
    var agents: Int
    var sound: Bool
    private var didFinishLoad = false
    private weak var webView: WKWebView?

    init(speed: Int, agents: Int, sound: Bool) {
        self.speed = speed
        self.agents = agents
        self.sound = sound
    }

    func attach(to webView: WKWebView) {
        self.webView = webView
        webView.navigationDelegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        didFinishLoad = true
        sendConfig(in: webView)
    }

    func update(speed: Int, agents: Int, sound: Bool, in webView: WKWebView) {
        guard self.speed != speed || self.agents != agents || self.sound != sound else { return }
        self.speed = speed
        self.agents = agents
        self.sound = sound
        if didFinishLoad {
            sendConfig(in: webView)
        }
    }

    private func sendConfig(in webView: WKWebView) {
        let js = "window.setSwarmConfig && window.setSwarmConfig({ speed: \(speed), agents: \(agents), sound: \(sound) });"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}

private enum PreviewFactory {
    static func make() -> WKWebView {
        let configuration = WKWebViewConfiguration()

        // The preview is a non-interactive poster: it can never receive the user
        // gesture WebKit normally requires before starting audio, so the sound
        // toggle would be silent on every platform. Lift the requirement for
        // this throwaway configuration only — the page's own click blips stay at
        // gain 0.04, and only play while the app's sound setting is on.
        configuration.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: configuration)

        #if os(macOS)
        webView.setValue(false, forKey: "drawsBackground")
        #elseif os(iOS)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.isUserInteractionEnabled = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.showsVerticalScrollIndicator = false
        webView.scrollView.showsHorizontalScrollIndicator = false
        #endif

        if let url = Bundle.main.url(forResource: "swarm-mini", withExtension: "html") {
            webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        }

        return webView
    }
}
