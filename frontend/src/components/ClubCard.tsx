import type {Club, ClubCategory} from '../types/club'

 
type ClubCardProps = {
    club: Club
    onJoin: (clubId: string) => void
}

{/*Meeting Dat and Times are optional so UI will reflect if it avaliable or not*/}
function formatMeetingTime(meeting: Club['meeting']): string {
    const meetingTime = [meeting?.day, meeting?.time].filter(Boolean)
    return meetingTime.length > 0 ? meetingTime.join(' ') : ""

}

export default function ClubCard ({club, onJoin}: ClubCardProps) {
    return (
        <div className= "card h-100 rounded-4 p4 d-flex flex-column"
            style = {{
                border: '2px solid #3046C3'
            }}
        >


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
    )

}

