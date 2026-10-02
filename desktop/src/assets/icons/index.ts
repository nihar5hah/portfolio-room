import React from 'react';
// macOS app icons: 128px WebP exports of the 256px PNG masters beside them
// (shown at 40-61px); regenerate with desktop/scripts/optimize-images.mjs.
import mail from './mail.svg';
import notes from './mac-notes.webp';
import begu from './mac-messages.webp';
import resume from './mac-preview.webp';
import music from './mac-music.webp';

import windowResize from './windowResize.png';
import maximize from './maximize.png';
import minimize from './minimize.png';
import computerBig from './computerBig.png';
import computerSmall from './computerSmall.png';
import myComputer from './myComputer.png';
import showcaseIcon from './mac-finder.webp';
import henordleIcon from './mac-textedit.webp';
import trash from './mac-trash.webp';
import credits from './mac-settings.webp';
import volumeOn from './volumeOn.png';
import volumeOff from './volumeOff.png';
import trailIcon from './trailIcon.png';
import windowGameIcon from './windowGameIcon.png';
import windowExplorerIcon from './windowExplorerIcon.png';
import windowsStartIcon from './windowsStartIcon.png';
import scrabbleIcon from './scrabbleIcon.png';
import close from './close.png';

const icons = {
    notes,
    begu,
    resume,
    music,
    mail,
    windowResize: windowResize,
    maximize: maximize,
    minimize: minimize,
    computerBig: computerBig,
    computerSmall: computerSmall,
    myComputer: myComputer,
    showcaseIcon: showcaseIcon,
    volumeOn: volumeOn,
    volumeOff: volumeOff,
    credits: credits,
    scrabbleIcon: scrabbleIcon,
    henordleIcon: henordleIcon,
    trash,
    close: close,
    windowGameIcon: windowGameIcon,
    windowExplorerIcon: windowExplorerIcon,
    windowsStartIcon: windowsStartIcon,
    trailIcon: trailIcon,
};

export type IconName = keyof typeof icons;

const getIconByName = (
    iconName: IconName,
    // @ts-ignore
): React.FC<React.SVGAttributes<SVGElement>> => icons[iconName];

export default getIconByName;
