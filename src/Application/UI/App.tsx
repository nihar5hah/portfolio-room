import React from 'react';
import ReactDOM from 'react-dom';
import LoadingScreen from './components/LoadingScreen';
import InterfaceUI from './components/InterfaceUI';
import './style.css';
const createUI = () =>
    ReactDOM.render(<LoadingScreen />, document.getElementById('ui'));
const createVolumeUI = () =>
    ReactDOM.render(<InterfaceUI />, document.getElementById('ui-interactive'));
export { createUI, createVolumeUI };
