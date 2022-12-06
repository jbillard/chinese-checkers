import { Store } from 'redux';
import { setPath, setPossiblePlaces } from 'redux/actions/game.action';
import { Type } from 'redux/actions/types';
import Api from 'services/api';
import Board, { ColourPosition } from './board';

type GameStatus = IGame['status'] | undefined;

export default class Game {
    private id?: string;
    private playerPosition?: number;
    private board: Board = new Board();
    private pawnTaken?: IPawn;
    private possiblePlaces?: IPath[];
    private path: IPath[] = [];
    private movesOffset = 0;
    private status?: GameStatus;

    private moves?: {
        pawn?: IPawn;
        places: IPawnPlace[][];
        position: number;
        offset: number;
    };

    constructor(private store: Store<any, any>) { }

    public setId(id: string) {
        this.id = id;
    }

    public setPlayerPosition(position: number) {
        this.playerPosition = position;
    }

    public async getBoard(gameId: string): Promise<IBoard> {
        const board: IBoard = {};
        const rawBoard = await Api.getBoard({
            gameId
        }).catch((err) => {
            throw err;
        });

        rawBoard.forEach((rawPawn: IRawPawn) => {
            const pawnPlace = this.board.getPawnFromRaw(rawPawn);
            const pawn = pawnPlace.pawn;
            if (pawn) {
                board[pawn.id] = pawnPlace.place;
            }
        });

        return board;
    }

    public async start(gameId: string) {
        await Api.startGame({
            gameId
        });

        const game = await this.getGame(gameId);
        this.status = game.status;
    }

    public async getGame(gameId: string): Promise<IGame> {
        return this.convertRawGame(await Api.getGame({
            gameId
        }).catch((err) => {
            throw err;
        }));
    }

    public async getAndStoreGame(gameId: string): Promise<IGame> {
        this.store.dispatch({
            payload: gameId,
            type: Type.SET_GAME
        });

        return await this.getGame(gameId);
    };

    public async getGames(values: ISearchGameParams): Promise<IGame[]> {
        return (await Api.getGames(values).catch((err) => {
            throw err;
        })).map((rawGame: IRawGame) => {
            return this.convertRawGame(rawGame);
        });
    };

    private convertRawGame(rawGame: IRawGame): IGame {
        const { created_at, id, longest_streak, players, turn, status, current_player } = rawGame;
        return {
            currentPlayer: current_player,
            id,
            createdAt: new Date(created_at),
            longestStreak: longest_streak,
            players: players.map((player: IRawGamePlayer): IGamePlayer => {
                const { position, nickname } = player;
                return {
                    nickname,
                    position
                };
            }),
            status,
            rounds: turn
        };
    };

    public async initBoard(gameId: string, newBoard = false): Promise<IPawnPlace[]> {
        this.board = new Board();
        setPossiblePlaces(this.store.dispatch, []);
        setPath(this.store.dispatch, []);
        if (!newBoard) {
            this.movesOffset = (await this.getMoves(gameId)).length;
            const game = await this.getGame(gameId);
            this.status = game.status;
            this.setPlayerPosition(game.currentPlayer);
            this.board.initBoard((await Api.getBoard({
                gameId
            }).catch((err) => {
                throw err;
            })).map((rawPawn: IRawPawn, index: number) => {
                const { pawn, coords } = rawPawn;
                return {
                    pawn: {
                        colour: ColourPosition[pawn],
                        id: `pawn${index}`
                    },
                    position: {
                        x: coords.x,
                        y: coords.y
                    }
                };
            }));
        }
        else {
            this.movesOffset = 0;
            this.status = 'STARTED';
            this.setPlayerPosition(0);
            this.board.initBoardWithDefault();
        }

        return this.board.getPawns();
    }

    public getStatus(): GameStatus {
        return this.status;
    }

    public getPlayerPosition(): number | undefined {
        return this.playerPosition;
    }

    public async getMoves(gameId: string): Promise<IPawnPlace[][]> {
        return (await Api.getMoves({
            gameId,
            offset: this.movesOffset
        }).catch((err) => {
            throw err;
        })).map((positions: IPosition[]) => {
            return positions.map((position: IPosition) => this.board.getPawnPlaceByPosition(position));
        });
    }

    public takePawn(pawnId: string) {
        const pawn = this.board.getPawnById(pawnId);
        this.setPawn(this.board.getPossiblePlacesForPawn(pawn), pawn);
    }

    public placePawn(place: string) {
        if (this.pawnTaken && this.id && this.playerPosition !== undefined) {
            const fullPath = [{
                place: this.board.getPlaceForPawn(this.pawnTaken)
            },
            ...this.path
            ];

            //this.board.placePawn(this.pawnTaken, place);
            //setPawnPlace(this.store.dispatch, this.pawnTaken, place);

            Api.newMove({
                gameId: this.id,
                playerIndex: this.playerPosition,
                moves: fullPath.map((path: IPath) => {
                    const position = this.board.getPositionForPlace(path.place);
                    return {
                        x: position.x,
                        y: position.y
                    };
                })
            });

            this.setPawn([]);
        }
    }

    public placePawnPlace(pawnPlace: IPawnPlace): IPawnPlace {
        const pawn = pawnPlace.pawn;
        if (pawn) {
            const pawnFound = this.board.getPawnById(pawn.id);
            this.board.placePawn(pawnFound, pawnPlace.place);

            //setPawns(this.store.dispatch, this.board.getPawns());
        }
        return pawnPlace;
    }

    private setPawn(possiblePlaces: IPath[], pawn?: IPawn) {
        this.path = [];
        this.pawnTaken = pawn;
        this.possiblePlaces = possiblePlaces;
        setPossiblePlaces(this.store.dispatch, this.possiblePlaces.map((path: IPath) => path.place));
        setPath(this.store.dispatch, this.getPath(this.path));
    }

    private getPath(path: IPath[]): IPath['place'][] {
        return path.map((pathPart: IPath) => pathPart.place);
    }

    public getPawns(): IPawnPlace[] {
        return this.board.getPawns();
    }

    public clickPlace(place: string): boolean {
        const path = this.getPath(this.path);
        // If click on a place already clicked
        if (path.includes(place)) {
            // And it's the last place clicked, we place the pawn
            if (place === path[path.length - 1]) {
                return this.doubleClickPlace(place);
            }
            // Else, reset path to this place
            else {
                this.path = this.path.reduce((newPath: IPath[], pathPart: IPath) => {
                    return !newPath.find((newPathPart: IPath) => newPathPart.place === place) ? newPath.concat([pathPart]) : newPath;
                }, []);

                this.setPathAndPossiblePlaces(place, this.path);
            }
        }
        else if (this.pawnTaken) {
            const possiblePlace = this.possiblePlaces?.find((pathPart: IPath) => pathPart.place === place);
            if (possiblePlace) {
                this.path.push(possiblePlace);

                this.setPathAndPossiblePlaces(place, this.path);
            }
        }

        return false;
    }

    public doubleClickPlace(place: string): boolean {
        if (this.pawnTaken && this.getPath(this.path).includes(place)) {
            this.placePawn(place);
            return true;
        }
        return false;
    }

    private setPathAndPossiblePlaces(place: string, path: IPath[]) {
        // If first move does not come from over pawn
        if (path.length > 0 && !path[0].fromOverPawn) {
            setPossiblePlaces(this.store.dispatch, []);
            setPath(this.store.dispatch, this.getPath(path));
        }
        else {
            const pathPlaces = this.getPath(path);
            // Remove entries from path and store it
            this.possiblePlaces = this.board.getPossiblePlacesForPlace(place);
            setPossiblePlaces(this.store.dispatch, this.possiblePlaces
                .filter((possiblePlace: IPath) => !pathPlaces.includes(possiblePlace.place))
                .map((possiblePlace: IPath) => possiblePlace.place));
            setPath(this.store.dispatch, pathPlaces);
        }
    }

    public async setMoves(gameId: string): Promise<IPawnPlace[][]> {
        this.moves = {
            pawn: undefined,
            places: await this.getMoves(gameId).catch((err) => {
                throw err;
            }),
            position: 0,
            offset: 0
        };
        this.movesOffset += this.moves.places.length;
        return this.moves.places;
    }

    public placeNextPawn(): IPawnPlace | undefined {
        if (this.moves) {
            let { places } = this.moves;
            if (places.length > 0 && this.moves.position < places.length) {
                if (this.moves.offset < places[this.moves.position].length) {

                    const place = places[this.moves.position][this.moves.offset].place;
                    if (!this.moves.pawn) {
                        const pawn = this.board.getPawnAtPlace(place);

                        if (pawn) {
                            this.moves.pawn = pawn;
                        }
                        else {
                            this.moves.offset++;
                            return this.placeNextPawn();
                        }
                    }

                    if (place === this.board.getPlaceForPawn(this.moves.pawn)) {
                        this.moves.offset++;
                        return this.placeNextPawn();
                    }

                    const pawnPlace = this.placePawnPlace({
                        pawn: this.moves.pawn,
                        place
                    });
                    this.moves.offset++;
                    return pawnPlace;
                }

                this.moves.pawn = undefined;
                this.moves.offset = 0;
                this.moves.position++;
                return this.placeNextPawn();

            }
            this.moves = undefined;
        }

        return undefined;
    }
}