import { CardState } from '../types.js';

const ANKI_CONNECT_VERSION = 6;

export function invoke(action: string, params = {}) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.addEventListener('error', () => reject('failed to issue request'));
        xhr.addEventListener('load', () => {
            try {
                const response: any = JSON.parse(xhr.responseText);
                if (Object.getOwnPropertyNames(response).length != 2) {
                    throw 'response has an unexpected number of fields';
                }
                if (!response.hasOwnProperty('error')) {
                    throw 'response is missing required error field';
                }
                if (!response.hasOwnProperty('result')) {
                    throw 'response is missing required result field';
                }
                if (response.error) {
                    throw response.error;
                }
                resolve(response.result);
            } catch (e) {
                reject(e);
            }
        });

        xhr.open('POST', 'http://127.0.0.1:8765');
        xhr.send(JSON.stringify({ action, version: ANKI_CONNECT_VERSION, params }));
    });
}

export function toCardState(card: any): CardState {
    let r: CardState = ['not-in-deck'];
    if (card) {
        switch (card.type) {
            // -- 0=new, 1=learning, 2=review, 3=relearning
            case 0:
                r = ['new'];
                break;
            case 1:
            case 3:
                r = ['learning'];
                break;
            case 2:
                //TODO Asayake cuttof interval in settings?
                if (card.interval > 30) r = ['known'];
                else r = ['due'];
                break;
        }
    }
    return r;
}
