import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react'
import { useState, useEffect } from 'react'
import ClubCard from '../components/ClubCard';
import type { Club } from '../types/club';
import Header from '../components/Header';
import Alert from 'react-bootstrap/Alert'


<<<<<<< Updated upstream
=======
async function readJson(response: Response) {
    try {
        return await response.json()
    } 
    catch {
        return null
    }
}
import Alert from 'react-bootstrap/Alert'



>>>>>>> Stashed changes
async function readJson(response: Response) {
    try {
        return await response.json()
    } 
    catch {
        return null
    }
}

export default function ClubDiscovery() {
  const navigate = useNavigate()
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    async function fetchClubs() {
      try{
        const response = await fetch ('/api/clubs',
          {
            method: 'GET',
            credentials: 'include'
          }
        )
        const data = await readJson(response)

        if(!response.ok){
          throw new Error(data?.message || `Could not load clubs (error ${response.status}).`)
        }

        setClubs(data?.clubs ?? [])
      }

      catch(err){
        setErrorMsg(err instanceof Error ? err.message : 'An error occurred while fetching clubs.')
      }

      finally {
        setLoading(false)
      }
    }

    fetchClubs()
  }, [])
  
  async function handleJoin(clubId: string) {
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const response = await fetch(`/api/clubs/${clubId}/join`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )

      const data = await readJson(response)

      if(response.status == 401) {
        navigate('/login')
        return
      }

      if(data?.code === 'ERR_ALREADY_MEMBER') {
        setSuccessMsg("You're already a member of this club.")
        return
      }

      if (!response.ok) {
        throw new Error(data?.message || "Failed to join club.")
      }

      setSuccessMsg('You joined the club!')
      setTimeout(() => setSuccessMsg(''), 5000) // Clear message after 5 secs

    }
    catch (err){
      setErrorMsg (err instanceof Error ? err.message : 'Failed to join club')
    }
  }

  //Only shows empty state if data finishes and there are zero results 
  const showEmpty = !loading && !errorMsg && clubs.length == 0;
  const navigate = useNavigate()
  const [clubs, setClubs] = useState<Club[]>([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    async function fetchClubs() {
      try{
        const response = await fetch ('/api/clubs',
          {
            method: 'GET',
            credentials: 'include'
          }
        )
        const data = await readJson(response)

        if(!response.ok){
          throw new Error(data?.message || `Could not load clubs (error ${response.status}).`)
        }

        setClubs(data?.clubs ?? [])
      }

      catch(err){
        setErrorMsg(err instanceof Error ? err.message : 'An error occurred while fetching clubs.')
      }

      finally {
        setLoading(false)
      }
    }

    fetchClubs()
  }, [])
  
  async function handleJoin(clubId: string) {
    setErrorMsg('')
    setSuccessMsg('')

    try {
      const response = await fetch(`/api/clubs/${clubId}/join`,
        {
          method: 'POST',
          credentials: 'include',
        }
      )

      const data = await readJson(response)

      if(response.status == 401) {
        navigate('/login')
        return
      }

      if(data?.code === 'ERR_ALREADY_MEMBER') {
        setSuccessMsg("You're already a member of this club.")
        return
      }

      if (!response.ok) {
        throw new Error(data?.message || "Failed to join club.")
      }

      setSuccessMsg('You joined the club!')
      setTimeout(() => setSuccessMsg(''), 5000) // Clear message after 5 secs

    }
    catch (err){
      setErrorMsg (err instanceof Error ? err.message : 'Failed to join club')
    }
  }

  //Only shows empty state if data finishes and there are zero results 
  const showEmpty = !loading && !errorMsg && clubs.length == 0;

  return (    
  return (    
    <div className="min-vh-100 bg-light">
      <Header/>
      <div className="container py-5">
        <h1 className="fw-bold mb-4" 
        style={{ 
          color: '#3046C3',
          fontFamily: 'Inter'
        }}>
          Discover Clubs
        </h1>

        {errorMsg && (
          <Alert variant="danger" className="mb-4">
            {errorMsg}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" className="mb-4">
            {successMsg}
          </Alert>
        )}

        {loading && (
          <div className="text-center py-5" 
            style = {{
              color: '#3046C3'
            }}>
            <h4> Loading clubs... </h4>
          </div>
        )}

        {showEmpty && (
          <div className="text-center text-muted py-5">
              <p>No clubs found right now. Check back later!</p>
          </div>
        )}
        {clubs.length > 0 && (
          <div className="row g-4">
            {clubs.map((club) => (
              <div key={club._id} className="col-12 col-md-6 col-lg-4">
                <ClubCard club={club} onJoin={handleJoin} />
              </div>
            ))}
          </div>
        )}   
        {errorMsg && (
          <Alert variant="danger" className="mb-4">
            {errorMsg}
          </Alert>
        )}

        {successMsg && (
          <Alert variant="success" className="mb-4">
            {successMsg}
          </Alert>
        )}

        {loading && (
          <div className="text-center py-5" 
            style = {{
              color: '#3046C3'
            }}>
            <h4> Loading clubs... </h4>
          </div>
        )}

        {showEmpty && (
          <div className="text-center text-muted py-5">
              <p>No clubs found right now. Check back later!</p>
          </div>
        )}
        {clubs.length > 0 && (
          <div className="row g-4">
            {clubs.map((club) => (
              <div key={club._id} className="col-12 col-md-6 col-lg-4">
                <ClubCard club={club} onJoin={handleJoin} />
              </div>
            ))}
          </div>
        )}   
      </div>


    </div>
  );
}
