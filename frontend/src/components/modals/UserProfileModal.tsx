import { useState, useEffect } from 'react';
import Modal from 'react-bootstrap/Modal';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import { Pencil, Gear, X } from 'react-bootstrap-icons';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import type { Club } from '../../types/club';
import type { User } from '../../types/user';
import { mockCurrentUser, mockUserClubs } from '../../mockData';

type UserProfileModalProps = {
  show: boolean;
  onHide: () => void;
  targetUser?: User | null;
  clubs?: Club[];
};
