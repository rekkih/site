"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type UserCountContextType = {
    count: number;
    setCount: (count: number) => void;
};

const UserCountContext = createContext<UserCountContextType>({
    count: 0,
    setCount: () => { },
});

export function UserCountProvider({ children }: { children: ReactNode }) {
    const [count, setCount] = useState(0);
    return (
        <UserCountContext.Provider value={{ count, setCount }}>
            {children}
        </UserCountContext.Provider>
    );
}

export function useUserCount() {
    return useContext(UserCountContext);
}
