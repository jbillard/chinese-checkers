import { Injectable } from '@nestjs/common';
import { IPlayerRepository } from './player-repository.interface';
import { Player } from './player.class';

@Injectable()
export class PlayerCacheRepository implements IPlayerRepository {

    public find(): Player[] {
        const players: Player[] = [];
        this.playerMap.forEach(player => players.push(player));
        return players;
    }

    public async findOneByNickname(nickname: string): Promise<Player | undefined> {
        const player = this.find().find(p => p.nickname === nickname);
        return player;
    }

    public async findByRating(): Promise<Player[]> {
        return this.find().sort((a, b) => b.rating - a.rating);
    }

    public async save(player: Player): Promise<void> {
        this.playerMap.set(player.nickname, player);
    }

    public async update(nickname: string, playerData: Partial<Player>): Promise<Player> {
        let player = this.playerMap.get(nickname);
        player = Object.assign(player, playerData);
        return player;
    }

    private playerMap: Map<string, Player> = new Map();
}