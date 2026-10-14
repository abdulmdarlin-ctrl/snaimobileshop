import { User, UserRole } from '../types';

export function activeStaffProfile(value: unknown, uid: string): User | null {
    if (!value || typeof value !== 'object' || !uid) return null;
    const profile = value as User;
    if (profile.isActive !== true || !Object.values(UserRole).includes(profile.role) || typeof profile.username !== 'string' || !profile.username.trim()) return null;
    return { ...profile, id: uid };
}
