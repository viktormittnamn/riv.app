import WidgetKit
import SwiftUI
import AppIntents

let GROUP = "group.se.rivblock.app"

// Data som appen skriver (se src/widget.js). Samma fält här och där.
struct Pad: Codable, Identifiable {
    let id: String, title: String, icon: String
    var left: Int, total: Int, next: Int
    let daily: Bool
    var lastDay: String?                  // "YYYY-MM-DD" senaste rivning
    let bg: String, ink: String, muted: String
}
struct Snapshot: Codable { let lang: String?; var pads: [Pad] }

func loadSnapshot() -> Snapshot? {
    guard let s = UserDefaults(suiteName: GROUP)?.string(forKey: "widget"), let d = s.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(Snapshot.self, from: d)
}
func loadPads() -> [Pad] { loadSnapshot()?.pads ?? [] }

func dayKey(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

// Appens språkval vinner; annars telefonens språk
var sv: Bool { (loadSnapshot()?.lang).map { $0 == "sv" } ?? (Locale.preferredLanguages.first?.hasPrefix("sv") ?? true) }
func L(_ s: String, _ e: String) -> String { sv ? s : e }

extension Color {
    init(hex: String) {
        var v: UInt64 = 0; Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}

/// Knappen "Riv av" på widgeten. Uppdaterar widgetens data direkt (så animationen syns)
/// och lägger rivningen i en kö som appen hämtar nästa gång den öppnas.
struct TearIntent: AppIntent {
    static var title: LocalizedStringResource = "Riv av lapp"
    @Parameter(title: "Block") var padId: String
    init() {}
    init(padId: String) { self.padId = padId }

    func perform() async throws -> some IntentResult {
        let ud = UserDefaults(suiteName: GROUP)
        guard var snap = loadSnapshot(), let i = snap.pads.firstIndex(where: { $0.id == padId }) else { return .result() }
        let today = dayKey(.now)
        if snap.pads[i].left <= 0 || (snap.pads[i].daily && snap.pads[i].lastDay == today) { return .result() }
        snap.pads[i].left -= 1; snap.pads[i].next += 1; snap.pads[i].lastDay = today
        if snap.pads[i].left == 0 { snap.pads.remove(at: i) } // tomt block lämnar widgeten
        ud?.set(String(data: try JSONEncoder().encode(snap), encoding: .utf8), forKey: "widget")
        var q = (ud?.array(forKey: "pendingTears") as? [[String: String]]) ?? []
        q.append(["id": padId, "at": ISO8601DateFormatter().string(from: .now)])
        ud?.set(q, forKey: "pendingTears")
        return .result()
    }
}

/// Avrivningen: gamla lappen faller ner och vrider sig från hörnet
struct Fall: ViewModifier {
    let on: Bool
    func body(content: Content) -> some View {
        content.rotationEffect(.degrees(on ? 16 : 0), anchor: .topTrailing).offset(y: on ? 140 : 0).opacity(on ? 0 : 1)
    }
}
extension AnyTransition {
    static var tearOff: AnyTransition { .asymmetric(insertion: .opacity, removal: .modifier(active: Fall(on: true), identity: Fall(on: false))) }
}

struct Entry: TimelineEntry { let date: Date; let pads: [Pad] }

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> Entry { Entry(date: .now, pads: [sample]) }
    func getSnapshot(in context: Context, completion: @escaping (Entry) -> Void) {
        let p = loadPads(); completion(Entry(date: .now, pads: p.isEmpty ? [sample] : p))
    }
    // Uppdatera vid midnatt, då "Klar för idag" blir "Dagens lapp väntar"
    func getTimeline(in context: Context, completion: @escaping (Timeline<Entry>) -> Void) {
        let midnight = Calendar.current.startOfDay(for: .now.addingTimeInterval(86400))
        completion(Timeline(entries: [Entry(date: .now, pads: loadPads()), Entry(date: midnight, pads: loadPads())], policy: .after(midnight)))
    }
    let sample = Pad(id: "X", title: L("Kalla bad", "Cold plunges"), icon: "🧊", left: 18, total: 30, next: 13, daily: true, lastDay: nil, bg: "#b8d4f1", ink: "#10284a", muted: "#42608a")
}

func rested(_ p: Pad, _ date: Date) -> Bool { p.daily && p.lastDay == dayKey(date) }

/// En lapp: svart bindning, perforering, stort nummer
struct TicketView: View {
    let pad: Pad; let date: Date; var compact = false
    var body: some View {
        let ink = Color(hex: pad.ink), muted = Color(hex: pad.muted)
        VStack(alignment: .leading, spacing: 0) {
            Rectangle().fill(Color(red: 0.106, green: 0.102, blue: 0.129)).frame(height: compact ? 8 : 10)
            Line().stroke(muted.opacity(0.6), style: StrokeStyle(lineWidth: 1.5, dash: [4, 4])).frame(height: 1).padding(.horizontal, 8).padding(.top, 8)
            HStack(alignment: .top) {
                Text(pad.icon).font(.system(size: compact ? 14 : 16))
                Spacer()
                if !rested(pad, date) { Circle().fill(Color(red: 0.94, green: 0.29, blue: 0.18)).frame(width: 8, height: 8) }
            }.padding(.horizontal, 10).padding(.top, 6)
            Spacer(minLength: 0)
            Text("\(pad.left)").font(.system(size: compact ? 40 : 48, weight: .black).width(.condensed)).foregroundStyle(ink)
                .contentTransition(.numericText(countsDown: true))
                .padding(.horizontal, 10).minimumScaleFactor(0.6).lineLimit(1)
            Text(rested(pad, date) ? L("Klar idag", "Done today") : L("kvar", "left")).font(.system(size: 10, weight: .medium, design: .monospaced)).textCase(.uppercase).foregroundStyle(muted)
                .padding(.horizontal, 10)
            Text(pad.title).font(.system(size: compact ? 11 : 12, weight: .semibold)).foregroundStyle(ink).lineLimit(1)
                .padding(.horizontal, 10).padding(.top, 2).padding(.bottom, rested(pad, date) ? 10 : 6)
            if !rested(pad, date) {
                Button(intent: TearIntent(padId: pad.id)) {
                    Text(L("Riv av", "Tear off")).font(.system(size: compact ? 9 : 10, weight: .semibold, design: .monospaced)).textCase(.uppercase)
                        .foregroundStyle(ink).frame(maxWidth: .infinity).padding(.vertical, 5)
                        .overlay(RoundedRectangle(cornerRadius: 5).stroke(ink.opacity(0.6), style: StrokeStyle(lineWidth: 1.2, dash: [3, 2])))
                }.buttonStyle(.plain).padding(.horizontal, 8).padding(.bottom, 8)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background(Color(hex: pad.bg))
    }
}
struct Line: Shape { func path(in r: CGRect) -> Path { var p = Path(); p.move(to: CGPoint(x: 0, y: r.midY)); p.addLine(to: CGPoint(x: r.maxX, y: r.midY)); return p } }

struct RivblockWidgetView: View {
    @Environment(\.widgetFamily) var family
    let entry: Entry
    var body: some View {
        if entry.pads.isEmpty {
            VStack(spacing: 6) {
                Text("RIVBLOCK").font(.system(size: 18, weight: .black).width(.condensed))
                Text(L("Skapa ett block i appen", "Create a pad in the app")).font(.caption).multilineTextAlignment(.center).foregroundStyle(.secondary)
            }.containerBackground(Color(red: 0.914, green: 0.91, blue: 0.933), for: .widget)
        } else {
            switch family {
            case .accessoryCircular:
                let p = entry.pads[0]
                Gauge(value: Double(p.total - p.left), in: 0...Double(max(1, p.total))) { Text(p.icon) } currentValueLabel: { Text("\(p.left)") }
                    .gaugeStyle(.accessoryCircular).containerBackground(.clear, for: .widget)
            case .accessoryRectangular:
                let p = entry.pads[0]
                VStack(alignment: .leading) {
                    Text("\(p.icon) \(p.title)").font(.headline).lineLimit(1)
                    Text(rested(p, entry.date) ? L("Klar för idag", "Done for today") : L("\(p.left) kvar · lapp \(p.next) väntar", "\(p.left) left · ticket \(p.next) waiting")).font(.caption)
                }.containerBackground(.clear, for: .widget)
            case .systemMedium:
                HStack(spacing: 8) {
                    ForEach(entry.pads.prefix(3)) { p in
                        Link(destination: URL(string: "rivblock://pad/\(p.id)")!) {
                            TicketView(pad: p, date: entry.date, compact: true).clipShape(RoundedRectangle(cornerRadius: 10))
                                .id("\(p.id)-\(p.next)").transition(.tearOff)
                        }
                    }
                }.containerBackground(Color(red: 0.914, green: 0.91, blue: 0.933), for: .widget)
            default:
                TicketView(pad: entry.pads[0], date: entry.date).id("\(entry.pads[0].id)-\(entry.pads[0].next)").transition(.tearOff)
                    .containerBackground(Color(hex: entry.pads[0].bg), for: .widget)
                    .widgetURL(URL(string: "rivblock://pad/\(entry.pads[0].id)"))
            }
        }
    }
}

@main
struct RivblockWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "RivblockWidget", provider: Provider()) { RivblockWidgetView(entry: $0) }
            .configurationDisplayName("Rivblock")
            .description(L("Dagens lapp och hur många som är kvar.", "Today's ticket and how many are left."))
            .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
            .contentMarginsDisabled()
    }
}
