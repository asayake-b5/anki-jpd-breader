import { CardState } from '../types.js';

export function invoke(action: String, version: Number, params = {}) {
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
        xhr.send(JSON.stringify({ action, version, params }));
    });
}

export function toCardState(card: any): CardState {
    let r: CardState = ['new'];
    if (card) {
        switch (card.type) {
            // -- 0=new, 1=learning, 2=review, 3=relearning
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
