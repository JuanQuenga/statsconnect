import SwiftUI

struct ProfileAvatarView: View {
    let imageURL: String?
    var size: CGFloat = 76

    var body: some View {
        Group {
            if let url = validatedImageURL {
                AsyncImage(url: url) { phase in
                    if let image = phase.image {
                        image
                            .resizable()
                            .scaledToFill()
                    } else {
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: size, height: size)
        .background(BrandStyle.orange.opacity(0.12), in: Circle())
        .clipShape(Circle())
        .overlay {
            Circle().strokeBorder(BrandStyle.orange.opacity(0.25), lineWidth: 1)
        }
        .accessibilityHidden(true)
    }

    private var placeholder: some View {
        Image(systemName: "person.crop.circle.fill")
            .resizable()
            .scaledToFit()
            .foregroundStyle(BrandStyle.orange)
            .padding(15)
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
