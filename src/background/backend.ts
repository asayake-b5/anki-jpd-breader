import { Card, CardState, DeckId, Token } from '../types.js';
import { assertNonNull, truncate } from '../util.js';
import { config } from './background.js';
import { invoke, toCardState } from './anki-connect.js';

const API_RATELIMIT = 0.2; // seconds between requests
const SCRAPE_RATELIMIT = 1.1; // seconds between requests

export type Response<T = null> = Promise<[T, number]>;

type JpdbError = {
    error:
        | 'bad_key'
        | 'bad_request'
        | 'bad_deck'
        | 'bad_vid'
        | 'bad_sid'
        | 'bad_rid'
        | 'bad_sentence'
        | 'bad_translation'
        | 'bad_image'
        | 'bad_audio'
        | 'too_many_decks'
        | 'too_many_cards_in_deck'
        | 'too_many_cards_in_total'
        | 'api_unavailable'
        | 'too_many_requests';
    error_message: string;
};

type TokenFields = {
    vocabulary_index: number;
    position: number;
    length: number;
    furigana: null | (string | [string, string])[];
};

type ApiCardState =
    | ['new' | 'learning' | 'known' | 'never-forget' | 'due' | 'failed' | 'suspended' | 'blacklisted']
    | ['redundant', 'learning' | 'known' | 'never-forget' | 'due' | 'failed' | 'suspended']
    | ['locked', 'new' | 'due' | 'failed']
    | ['redundant', 'locked'] // Weird outlier, might either be due or failed
    | null;

type VocabFields = {
    vid: number;
    sid: number;
    rid: number;
    spelling: string;
    reading: string;
    frequency_rank: number | null;
    meanings: string[];
    card_level: number | null;
    card_state: ApiCardState;
    due_at: number;
    alt_sids: number[];
    alt_spellings: string[];
    part_of_speech: string[];
    meanings_part_of_speech: string[][];
    meanings_chunks: string[][];
    pitch_accent: string[] | null; // Whether this can be null or not is undocumented
};

type MapFieldTuple<Tuple extends readonly [...(keyof Fields)[]], Fields> = { [I in keyof Tuple]: Fields[Tuple[I]] };

// NOTE: If you change these, make sure to change the .map calls down below in the parse function too
const TOKEN_FIELDS = ['vocabulary_index', 'position', 'length', 'furigana'] as const;
const VOCAB_FIELDS = ['spelling'] as const;

export async function parse(text: string[]): Response<[Token[][], Card[]]> {
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiToken}`,
            Accept: 'application/json',
        },
        body: JSON.stringify({
            text,
            // furigana: [[position, length reading], ...] // TODO pass furigana to parse endpoint
            position_length_encoding: 'utf16',
            token_fields: TOKEN_FIELDS,
            vocabulary_fields: VOCAB_FIELDS,
        }),
    };

    const response = await fetch('https://jpdb.io/api/v1/parse', options);

    if (!(200 <= response.status && response.status <= 299)) {
        const data = (await response.json()) as JpdbError;
        throw Error(`${data.error_message} while parsing 「${truncate(text.join(' '), 20)}」`);
    }

    const data = (await response.json()) as {
        tokens: MapFieldTuple<typeof TOKEN_FIELDS, TokenFields>[][];
        vocabulary: MapFieldTuple<typeof VOCAB_FIELDS, VocabFields>[];
    };

    //TODO Asayake change query from within settings?
    //TODO Asayake anki ignore list deck, ala blacklist?
    const query = data.vocabulary.map(word => `Word:${word[0]} `).join(' OR ');

    const ankiCards: any[] = await invoke('findCards', { query }).then(async cards => {
        const r = await invoke('cardsInfo', {
            cards,
        });
        return r as any[];
    });

    const cards: Card[] = data.vocabulary.map(vocab => {
        // NOTE: If you change these, make sure to change VOCAB_FIELDS too
        const [spelling] = vocab;
        let id = 0;
        //TODO Asayake put this in settings
        const ankiCard = ankiCards.find(card => card.fields['Word'].value == spelling);
        if (ankiCard) id = ankiCard.id;
        // console.log(ankiCard);
        return {
            id: id, //TODO FIXME Asayake handle 0 better?
            spelling,
            state: toCardState(ankiCard),
        };
    });

    const tokens: Token[][] = data.tokens.map(tokens =>
        tokens.map(token => {
            // This is type-safe, but not... variable name safe :/
            // NOTE: If you change these, make sure to change TOKEN_FIELDS too
            const [vocabularyIndex, position, length, furigana] = token;

            const card = cards[vocabularyIndex];

            let offset = position;
            const rubies =
                furigana === null
                    ? []
                    : furigana.flatMap(part => {
                          if (typeof part === 'string') {
                              offset += part.length;
                              return [];
                          } else {
                              const [base, ruby] = part;
                              const start = offset;
                              const length = base.length;
                              const end = (offset = start + length);
                              return { text: ruby, start, end, length };
                          }
                      });

            return {
                card,
                start: position,
                end: position + length,
                length: length,
                rubies,
            };
        }),
    );

    return [[tokens, cards], API_RATELIMIT];
}

const REVIEW_GRADES = {
    again: '1',
    hard: '2',
    good: '4',
    easy: '5',
};
export async function review(id: number, rating: keyof typeof REVIEW_GRADES): Response {
    await invoke('answerCards', {
        answers: [
            {
                cardId: id,
                ease: REVIEW_GRADES[rating],
            },
        ],
    });
    return [null, 0];
}

export async function getCardState(id: number): Response<CardState> {
    //TODO Asayake remake this?

    // const options = {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         Authorization: `Bearer ${config.apiToken}`,
    //         Accept: 'application/json',
    //     },
    //     body: JSON.stringify({
    //         list: [[vid, sid]],
    //         fields: ['card_state'],
    //     }),
    // };
    // const response = await fetch('https://jpdb.io/api/v1/lookup-vocabulary', options);
    // if (!(200 <= response.status && response.status <= 299)) {
    //     const data = (await response.json()) as JpdbError;
    //     throw Error(`${data.error_message} while getting state for word ${vid}/${sid}`);
    // }
    // type MapFieldTuple<Tuple extends readonly [...(keyof Fields)[]], Fields> = { [I in keyof Tuple]: Fields[Tuple[I]] };
    // const data = (await response.json()) as { vocabulary_info: [MapFieldTuple<['card_state'], VocabFields> | null] };
    // const vocabInfo = data.vocabulary_info[0];
    // if (vocabInfo === null) throw Error(`Can't get state for word ${vid}/${sid}, word does not exist`);
    // return [vocabInfo[0] ?? ['not-in-deck'], API_RATELIMIT];
    return [['not-in-deck'], API_RATELIMIT];
}
