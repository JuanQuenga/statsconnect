import SwiftUI

struct ProfileAvatarView: View {
    let imageURL: String?
    var size: CGFloat = 76

    var body: some View {
        Group {
            if let url = validatedImageURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        // Game icons are square art that can bleed past the
                        // square, so they are never cropped or masked.
                        image
                            .resizable()
                            .scaledToFit()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        Image(systemName: "person.crop.circle.fill")
            .resizable()
            .scaledToFit()
            .foregroundStyle(BrandStyle.orange)
            .padding(15)
            .background(BrandStyle.orange.opacity(0.12), in: Circle())
    }

    private var validatedImageURL: URL? {
        guard
            let imageURL,
            let components = URLComponents(string: imageURL),
            components.scheme?.lowercased() == "https",
            components.host?.isEmpty == false
        else {
            return nil
        }

        return components.url
    }
}
