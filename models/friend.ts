import { Table, pk, sk } from "./tableDecorator";

@Table("Friend")
export class Friend {
  @pk
  player_id: string;
  @sk
  friend_id: string;
  state: State;
  last_updated: number;
}

export enum State {
  Requested = "Requested",
  Pending = "Pending",
  Friends = "Friends",
}
