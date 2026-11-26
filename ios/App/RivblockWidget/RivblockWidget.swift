import WidgetKit
import SwiftUI

// Data som appen skriver (se src/widget.js). Samma fält här och där.
struct Pad: Codable, Identifiable {
    let id: String, title: String, icon: String
    let left: Int, total: Int, next: Int
    let daily: Bool, lastDay: String?     // "YYYY-MM-DD" senaste rivning
    let bg: String, ink: String, muted: String
}
struct Snapshot: Codable { let pads: [Pad] }

func loadPads() -> [Pad] {
    guard let s = UserDefaults(suiteName: "group.se.rivblock.app")?.string(forKey: "widget"),
          let d = s.data(using: .utf8), let snap = try? JSONDecoder().decode(Snapshot.self, from: d) else { return [] }
    return snap.pads
}

func dayKey(_ date: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
}

let sv = Locale.preferredLanguages.first?.hasPrefix("sv") ?? true
func L(_ s: String, _ e: String) -> String { sv ? s : e }

extension Color {
    init(hex: String) {
        var v: UInt64 = 0; Scanner(string: hex.replacingOccurrences(of: "#", with: "")).scanHexInt64(&v)
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
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
                .padding(.horizontal, 10).minimumScaleFactor(0.6).lineLimit(1)
            Text(rested(pad, date) ? L("Klar idag", "Done today") : L("kvar", "left")).font(.system(size: 10, weight: .medium, design: .monospaced)).textCase(.uppercase).foregroundStyle(muted)
                .padding(.horizontal, 10)
            Text(pad.title).font(.system(size: compact ? 11 : 12, weight: .semibold)).foregroundStyle(ink).lineLimit(1)
                .padding(.horizontal, 10).padding(.top, 2).padding(.bottom, 10)
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
                    ForEach(entry.pads.prefix(3)) { p in TicketView(pad: p, date: entry.date, compact: true).clipShape(RoundedRectangle(cornerRadius: 10)) }
                }.containerBackground(Color(red: 0.914, green: 0.91, blue: 0.933), for: .widget)
            default:
                TicketView(pad: entry.pads[0], date: entry.date).containerBackground(Color(hex: entry.pads[0].bg), for: .widget)
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
