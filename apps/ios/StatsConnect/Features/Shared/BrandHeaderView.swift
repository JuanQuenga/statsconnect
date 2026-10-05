import SwiftUI

struct BrandHeaderView: View {
    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.orange.gradient)

                Image(systemName: "arrow.triangle.2.circlepath")
                    .font(.system(size: 24, weight: .bold))
                    .foregroundStyle(.white)

                Image("StatsConnectIcon")
                    .resizable()
                    .scaledToFit()
                    .padding(7)
                    .accessibilityHidden(true)
            }
            .frame(width: 54, height: 54)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text("StatsConnect")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.primary)

                Text("Your games, together")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}
