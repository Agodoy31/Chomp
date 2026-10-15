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

}