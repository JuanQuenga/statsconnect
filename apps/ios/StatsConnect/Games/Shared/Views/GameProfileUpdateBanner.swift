import SwiftUI

struct GameProfileUpdateBanner: View {
    let isRefreshing: Bool
    let errorMessage: String?
    let onRetry: @MainActor () async -> Void

    @State private var retryTask: Task<Void, Never>?

    var body: some View {
        if isRefreshing || errorMessage != nil {
            VStack(alignment: .leading, spacing: 10) {
                if isRefreshing {
                    HStack(spacing: 9) {
                        ProgressView()
                            .tint(BrandStyle.orange)
                        Text("Refreshing player stats…")
                            .font(.subheadline.weight(.medium))
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityAddTraits(.updatesFrequently)
                }

                if let errorMessage {
                    Label("Couldn’t refresh", systemImage: "exclamationmark.triangle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.orange)

                    Text("\(errorMessage) Your loaded profile is still available.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Button {
                        startRetry()
                    } label: {
                        Label("Try again", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.bordered)
                    .tint(BrandStyle.actionOrange)
                    .disabled(isRefreshing || retryTask != nil)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .strokeBorder(.quaternary, lineWidth: 1)
            }
            .onDisappear(perform: cancelRetry)
        }
    }

    private func startRetry() {
        guard !isRefreshing, retryTask == nil else {
            return
        }
        retryTask = Task { @MainActor in
            await onRetry()
            retryTask = nil
        }
    }

    private func cancelRetry() {
        retryTask?.cancel()
        retryTask = nil
    }
}
