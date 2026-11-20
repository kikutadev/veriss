declare global {
    interface Window {
        __shifts: {
            value: number;
            input: boolean;
        }[];
        __s: [number, number][];
    }
}
export {};
