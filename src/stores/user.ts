import { signal } from '../core/signal';

export interface User {
  id: string;
  name: string;
}

class UserStore {
  currentUser = signal<User>({
    id: 'local-user',
    name: 'Local User'
  });

  getCurrentUserId(): string {
    return this.currentUser.value.id;
  }

  setCurrentUser(user: User) {
    this.currentUser.value = user;
  }
}

export const userStore = new UserStore();
