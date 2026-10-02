import SwiftUI
import UIKit

@MainActor
enum BrandStyle {
    static let orange = Color(
        uiColor: UIColor { traits in
            if traits.userInterfaceStyle == .dark {
                return UIColor(red: 1.00, green: 0.62, blue: 0.22, alpha: 1)
            }
            return UIColor(red: 0.66, green: 0.21, blue: 0.03, alpha: 1)
        }
    )

    static let actionOrange = Color(red: 0.68, green: 0.23, blue: 0.03)
}
