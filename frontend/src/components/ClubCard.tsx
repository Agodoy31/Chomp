import type { Club } from '../types/club'

 
type ClubCardProps = {
    club: Club
    onJoin: (clubId: string) => void
}

// Meeting day and time are optional, so the card only shows what exists
function formatMeetingTime(meeting: Club['meeting']): string {
    const meetingTime = [meeting?.day, meeting?.time].filter(Boolean)
    return meetingTime.length > 0 ? meetingTime.join(' ') : ""

}

export default function ClubCard ({club, onJoin}: ClubCardProps) {
    const meetingTime = formatMeetingTime(club.meeting)
    const location = club.meeting?.location

    return (
        <div className= "card h-100 rounded-4 shadow-sm"
            style = {{
                border: '2px solid #3046C3'
            }}
        >
            <div className="card-body d-flex flex-column p-4"> 
                <span className= "badge bg-primary-subtle text-primary mb-2 align-self-start">
                    {club.category}
                </span>
                

                <h4 className = "card-title fw-bold text-dark">
                    {club.name}
                </h4>

                <p className="card-text text-muted mb-3">
                    {club.description}
                </p>
                <div className="mb-4">
                    {meetingTime && <p className="mb-1">{meetingTime}</p>}
                    {location && <p className="mb-0">{location}</p>}
                </div>

                <button
                    className="btn rounded-pill w-100 fw-semibold mt-auto py-2"
                    style={{ 
                        backgroundColor: '#F07833', 
                        borderColor: '#14246D',
                        color: '#14246D' 
                    }}
                    onClick={() => onJoin(club._id)}
                >
                    Join
                </button>
                </div>
        </div>
    )

}

