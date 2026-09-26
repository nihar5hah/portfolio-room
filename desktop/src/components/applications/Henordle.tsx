import React, { memo } from 'react';
import Window from '../os/Window';
import Wordle from '../wordle/Wordle';
import GEOMETRY from './geometry';

export interface HenordleAppProps extends WindowAppProps {}

const HenordleApp: React.FC<HenordleAppProps> = (props) => {
    return (
        <Window
            {...GEOMETRY.henordle()}
            windowBarIcon="windowGameIcon"
            windowTitle="Word game"
            closeWindow={props.onClose}
            onInteract={props.onInteract}
            active={props.active}
            minimizeWindow={props.onMinimize}
            bottomLeftText="Daily and unlimited · stats saved on this device"
        >
            <div className="site-page">
                <Wordle />
            </div>
        </Window>
    );
};

export default memo(HenordleApp);
