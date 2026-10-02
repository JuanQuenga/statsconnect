import SwiftUI

struct GameModulePicker: View {
    let modules: [GameProfileModule]
    @Binding var selection: GameProfileModule

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(modules) { module in
                    Button {
                        selection = module
                    } label: {
                        Label(module.title, systemImage: module.symbol)
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 12)
                            .foregroundStyle(selection == module ? Color.white : Color.primary)
                            .background(selection == module ? BrandStyle.actionOrange : Color(uiColor: .secondarySystemGroupedBackground), in: Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selection == module ? .isSelected : [])
                }
            }
            .padding(.horizontal, 18)
        }
        .scrollIndicators(.hidden)
        .sensoryFeedback(.selection, trigger: selection)
    }
}
