import { create } from 'zustand';

interface SidebarState {
  isCollapsed: boolean;
  isOpen: boolean;
  toggleCollapse: () => void;
  setCollapsed: (collapsed: boolean) => void;
  toggleOpen: () => void;
  setOpen: (open: boolean) => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
  isOpen: false,
  
  toggleCollapse: () => set((state) => {
    const newValue = !state.isCollapsed;
    localStorage.setItem('sidebarCollapsed', String(newValue));
    return { isCollapsed: newValue };
  }),
  
  setCollapsed: (collapsed: boolean) => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
    set({ isCollapsed: collapsed });
  },
  
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
  
  setOpen: (open: boolean) => set({ isOpen: open }),
}));
