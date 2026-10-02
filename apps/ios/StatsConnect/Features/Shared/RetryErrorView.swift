import SwiftUI

struct RetryErrorView: View {
    let message: String
    let retryAction: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Couldn’t load this profile", systemImage: "exclamationmark.triangle.fill")
                .font(.headline)
                .foregroundStyle(.red)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button("Try again", systemImage: "arrow.clockwise", action: retryAction)
                .buttonStyle(.bordered)
                .tint(BrandStyle.actionOrange)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .strokeBorder(.red.opacity(0.22), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
    }
}
