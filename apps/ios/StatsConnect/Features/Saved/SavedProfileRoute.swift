struct SavedProfileRoute: Hashable {
    let result: ProfileResult

    static func == (lhs: Self, rhs: Self) -> Bool { lhs.result.id == rhs.result.id }
    func hash(into hasher: inout Hasher) { hasher.combine(result.id) }
}
