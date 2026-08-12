import { EventEmitter } from 'events';

export const CLUW_Bus = new EventEmitter();
CLUW_Bus.setMaxListeners(50);
