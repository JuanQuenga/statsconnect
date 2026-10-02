import SwiftUI

struct GameProfileStatCard: View {
    let title: String
    let value: String?
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            Label(title, systemImage: symbol)
                .font(.caption.weight(.medium))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Text(value ?? "Unavailable")
                .font(.title3.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(value == nil ? .secondary : .primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("\(title): \(value ?? "unavailable")")
        }
        .frame(maxWidth: .infinity, minHeight: 70, alignment: .leading)
        .padding(13)
        .background(.background, in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 17, style: .continuous)
                .strokeBorder(.quaternary, lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}
