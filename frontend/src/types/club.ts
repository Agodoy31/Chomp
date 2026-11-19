export type ClubCategory = 'ACADEMIC' | 'CULTURAL' | 'SPORTS' | 'OTHER'

export type Club = {
    _id : string
    name : string
    description: string
    category: ClubCategory

    meeting?: {
        day?: string
        time?: string
        location?: string
    }

    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    role?: 'MEMBER' | 'OFFICER'

}

// Public club payload from GET /api/clubs/:clubId. Review fields are omitted.
export type ClubDetails = Pick<Club, '_id' | 'name' | 'description' | 'category' | 'meeting'>

export type ClubChannel = {
    _id: string
    title: string
}

export type ClubMember = {
    userId: string
    firstName: string
    lastName: string
    role: 'MEMBER' | 'OFFICER'
}