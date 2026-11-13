import { SessionPacketSchema, SessionScreenDataSchemas, type SessionPacket, type SessionScreenData, type SessionScreenView } from "../contracts/session";
export { SessionPacketSchema as PacketSchema };
export type Packet = SessionPacket;
export type ScreenData = SessionScreenData;
export type View = SessionScreenView | { screen: "unavailable"; data: NonNullable<SessionPacket["unavailable"]> };
export type ScreenDecoder = (packet: Packet) => View;
export const decodeScreen: ScreenDecoder = raw => {
  const packet = SessionPacketSchema.parse(raw);
  if (packet.unavailable) return { screen: "unavailable", data: packet.unavailable };
  if (packet.state === "ended") return { screen: "ended" };
  const show = [...packet.effects].reverse().find(effect => effect.screen === packet.state)!;
  if (packet.state in SessionScreenDataSchemas) {
    const schema = SessionScreenDataSchemas[packet.state as keyof ScreenData];
    return { screen: packet.state, data: schema.parse(show.data) } as View;
  }
  return { screen: packet.state } as View;
};
