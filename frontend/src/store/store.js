import { configureStore } from '@reduxjs/toolkit';
import globalTableReducer from './globalTableSlice';

const store = configureStore({
    reducer: {
        globalTable: globalTableReducer,
    },
});

export default store;