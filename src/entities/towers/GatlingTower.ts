import {CanonTower} from "./CanonTower";
import {texturePaths} from "../../tools/texturePaths";
import {TowerType} from "./towerTypes";

export class GatlingTower extends CanonTower {
    public texturePath = texturePaths.towers.gatling;
    public towerType: TowerType = 'gatling';
    public name = 'Gatling';
    public description = 'Enhanced version of the Canon tower with a high shooting rate.'

    public reloadDurationMs: number = 200;
    public cost: number = 100;

    public colors = {
        primary: '#44b0e5',
        secondary: '#71d0ff'
    };

}
