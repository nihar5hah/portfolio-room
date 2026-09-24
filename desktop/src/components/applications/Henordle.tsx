import React from 'react';
import Window from '../os/Window';
import Wordle from '../wordle/Wordle';

export interface HenordleAppProps extends WindowAppProps {}

const HenordleApp: React.FC<HenordleAppProps> = (props) => {
    return (
        <Window
            top={Math.max(40, (innerHeight - 90 - Math.min(780, innerHeight - 140)) / 2)}
            left={Math.max(12, (innerWidth - Math.min(560, innerWidth - 24)) / 2)}
            width={Math.min(560, innerWidth - 24)}
            height={Math.min(780, innerHeight - 140)}
            windowBarIcon="windowGameIcon"
            windowTitle="Word game"
            closeWindow={props.onClose}
            onInteract={props.onInteract}
            minimizeWindow={props.onMinimize}
            bottomLeftText="Word game by Henry Heffernan"
        >
            <div className="site-page">
                <Wordle />
            </div>
        </Window>
    );
};

export default HenordleApp;
