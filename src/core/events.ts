import { EventEmitter } from 'events';

export const ANT_Bus = new EventEmitter();
ANT_Bus.setMaxListeners(50);
