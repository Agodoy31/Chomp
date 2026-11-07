import type { Club } from './types/club';
import type { User } from './types/user';

export const mockCurrentUser: User = {
  id: 'user-1',
  email: 'spierrelouis@ufl.edu',
  firstName: 'Sephora',
  lastName: 'Pierre-Louis',
  bio: 'Computer Science major minoring in Accounting.',
  isAdmin: false,
};

export const mockUserClubs: Club[] = [
  {
    _id: 'club1',
    name: 'Software Engineering Club',
    description: 'Building projects and learning full-stack development.',
    category: 'ACADEMIC',
    status: 'APPROVED',
  },
  {
    _id: 'club2',
    name: 'ACM @ UF',
    description: 'Association for Computing Machinery student chapter.',
    category: 'ACADEMIC',
    status: 'APPROVED',
  },
  {
    _id: 'club3',
    name: 'Women in Computer Science',
    description: 'Supporting women in technical fields.',
    category: 'ACADEMIC',
    status: 'APPROVED',
  },
];