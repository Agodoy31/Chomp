import { createContext, useEffect, useState, type ReactNode } from 'react'
import type { User } from '../types/user'

type AuthContextValue = {
    user: User | null
    loading: boolean
    setUser: (user: User | null) => void
    logout: () => Promise<void>
}

// eslint-disable-next-line react-refresh/only-export-components
export const AuthContext = createContext<AuthContextValue | null>(null)
 
export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect (() => {
        async function checkSession() {
            try {
                const response = await fetch('/api/auth/me', {
                    credentials: 'include'
                })

                if (response.ok){
                    const data = await response.json()
                    setUser(data.user)
                }
            }
            catch{
                // Ignore session errors
            }
            finally {
                setLoading(false)
            }
        }

        checkSession()
    }, [])

    async function logout() {
        try {
            await fetch('/api/auth/logout',{
                method: 'POST',
                credentials: 'include'
            })
        }
        catch {
            //Ignore logout fetch
        }
        setUser(null)
    }

    return (
        <AuthContext.Provider value={{ user, loading, setUser, logout}}>
            {children}
        </AuthContext.Provider>
    )
}
