import Capacitor
import WidgetKit

/// Tar emot widgetens data från webbappen och lägger den i den delade App Group-lådan.
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise)
    ]

    @objc func set(_ call: CAPPluginCall) {
        UserDefaults(suiteName: "group.se.rivblock.app")?.set(call.getString("json") ?? "", forKey: "widget")
        WidgetCenter.shared.reloadAllTimelines()
        call.resolve()
    }

    /// Rivningar gjorda från widgeten sedan sist; tömmer kön.
    @objc func takePending(_ call: CAPPluginCall) {
        let ud = UserDefaults(suiteName: "group.se.rivblock.app")
        let q = ud?.array(forKey: "pendingTears") ?? []
        ud?.removeObject(forKey: "pendingTears")
        let json = (try? JSONSerialization.data(withJSONObject: q)).flatMap { String(data: $0, encoding: .utf8) } ?? "[]"
        call.resolve(["json": json])
    }
}

/// Capacitors vy, med vår lokala plugin registrerad.
class RivblockViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridgePlugin())
    }
}
