declare const fallbackContent: {
    preset: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        officeSpec: string;
        render: {
            detail: string;
        };
        content: {
            style: string;
            layout: string;
            agentSkin: string;
            props: string;
            npcs: string;
            lifeActivities: string;
            atmosphere: string;
            environment: string;
        };
    };
    style: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        tokens: {
            css: {
                bg: string;
                panel: string;
                "panel-2": string;
                line: string;
                ink: string;
                dim: string;
                accent: string;
                ok: string;
                warn: string;
                think: string;
            };
            canvas: {
                outline: string;
                objectShadow: string;
                floorA: string;
                floorB: string;
                floorC: string;
                floorLine: string;
                floorGrain: string;
                rug: string;
                rugEdge: string;
                wall: string;
                wallTop: string;
                wallTrim: string;
                wallShade: string;
                wallSeam: string;
                wallHighlight: string;
                wallBase: string;
                wood: string;
                woodDark: string;
                woodGrain: string;
                deskTop: string;
                deskLite: string;
                screen: string;
                screenGlow: string;
                chair: string;
                chairLite: string;
                chairDark: string;
                metal: string;
                metalDark: string;
                rack: string;
                board: string;
                boardFrame: string;
                glass: string;
                glassLite: string;
                glassShine: string;
                skyMorning: string;
                skyNoon: string;
                skyEvening: string;
                skyNight: string;
                skyNightLite: string;
                skyHorizon: string;
                skySun: string;
                skyStar: string;
                skyBuilding: string;
                skyWindow: string;
                roomLightEvening: string;
                roomLightNight: string;
                plant: string;
                plantDark: string;
                plantLite: string;
                plantHighlight: string;
                pot: string;
                paper: string;
                door: string;
                doorDark: string;
                doorPanel: string;
                doorLite: string;
                windowSpark: string;
                boardText: string;
                boardTextDim: string;
                boardIdle: string;
                activeRed: string;
                activeBlue: string;
                activeGreen: string;
                activeThink: string;
                activeAccent: string;
                screenIdle: string;
                paperLine: string;
                metalLite: string;
                drawerLite: string;
                drawerHandle: string;
                drawerOpen: string;
                rackTrim: string;
                rackPanel: string;
                rackLine: string;
                signalOn: string;
                signalOff: string;
                coffeePanel: string;
                coffeeHot: string;
                coffeeIdle: string;
                steam: string;
                waterBody: string;
                waterDark: string;
                waterGlass: string;
                waterLevel: string;
                waterActive: string;
                rain: string;
                phoneTop: string;
                phoneDevice: string;
                phoneIdle: string;
                meetingPaper: string;
                meetingDevice: string;
                potLite: string;
                keyboard: string;
                keyboardKey: string;
                mug: string;
                mugLite: string;
            };
            character: {
                outline: string;
                shadow: string;
                pants: string;
                shoes: string;
                shirtShade: string;
                shirtLite: string;
                skinShade: string;
                hairLite: string;
                eyeLite: string;
                faceInk: string;
                mouth: string;
                pips: {
                    thinking: string;
                    working: string;
                    waiting: string;
                    talking: string;
                    done: string;
                    error: string;
                    idle: null;
                };
                particles: {
                    key: string;
                    keyInset: string;
                    paper: string;
                    paperLine: string;
                    check: string;
                    bang: string;
                    cross: string;
                    spark: string;
                    fallback: string;
                };
            };
            motion: {
                actorSpeed: number;
                bubbleThinkMs: number;
                bubbleSayMs: number;
                bubbleActionMs: number;
            };
        };
    };
    layout: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        canvas: {
            width: number;
            height: number;
        };
        wallHeight: number;
        camera: {
            mode: string;
            fit: string;
            integerScale: boolean;
        };
        zones: {
            id: string;
            name: string;
            x: number;
            y: number;
            width: number;
            height: number;
        }[];
        textSlots: {
            id: string;
            name: string;
            x: number;
            y: number;
            width: number;
            height: number;
            maxLength: number;
            defaultText: string;
        }[];
        placementSlots: ({
            id: string;
            zone: string;
            x: number;
            y: number;
            accepts: string[];
            maxSize: {
                width: number;
                height: number;
            };
            required: boolean;
            occupiedBy?: undefined;
        } | {
            id: string;
            zone: string;
            x: number;
            y: number;
            accepts: string[];
            maxSize: {
                width: number;
                height: number;
            };
            required: boolean;
            occupiedBy: string;
        })[];
        navigation: {
            lanes: number[];
            connectors: number[];
        };
        seats: {
            index: number;
            cx: number;
            desk: {
                x: number;
                y: number;
                width: number;
                height: number;
            };
            anchor: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
        }[];
        standingAnchors: {
            x: number;
            y: number;
            dir: string;
            lane: number;
            zone: string;
        }[];
        targets: {
            "staff-entry": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            archive: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            server: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            whiteboard: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            phone: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            coffee: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            meetA: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            meetB: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            entry: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "boss-seat": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            restroom: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            water: {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "phone-break": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "chat-a": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "chat-b": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "walk-outside-a": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "walk-outside-b": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "cleaner-entry": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "clean-desks-north": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "clean-desks-south": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "clean-lounge": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "plant-left": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "plant-middle": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
            "plant-right": {
                x: number;
                y: number;
                dir: string;
                lane: number;
            };
        };
        stations: {
            research: {
                kind: string;
                target: string;
            };
            create: {
                kind: string;
            };
            compute: {
                kind: string;
                target: string;
            };
            plan: {
                kind: string;
                target: string;
            };
            communicate: {
                kind: string;
                target: string;
            };
            collaborate: {
                kind: string;
                meetingTargets: string[];
            };
            coffee: {
                kind: string;
                target: string;
            };
        };
        legacyActions: {
            type: string;
            archive: string;
            server: string;
            whiteboard: string;
            phone: string;
            delegate: string;
            coffee: string;
        };
        furniture: {
            archive: {
                x: number;
                y: number;
                w: number;
                h: number;
            };
            server: {
                x: number;
                y: number;
                w: number;
                h: number;
            };
            coffee: {
                x: number;
                y: number;
                w: number;
                h: number;
            };
            phone: {
                x: number;
                y: number;
                w: number;
                h: number;
            };
            whiteboard: {
                x: number;
                y: number;
                w: number;
                h: number;
            };
            meeting: {
                x: number;
                y: number;
                w: number;
                h: number;
            };
        };
        propInstances: ({
            id: string;
            type: string;
            x: number;
            y: number;
            orientation?: undefined;
        } | {
            id: string;
            type: string;
            x: number;
            y: number;
            orientation: string;
        })[];
        npcSpawns: string[];
    };
    agentSkin: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        animations: string[];
        palettes: {
            skin: string[];
            hair: string[];
            fallbackShirts: string[];
            defaultTrim: string;
            leadBadge: string;
            agentBadge: string;
        };
        roles: {
            scout: {
                title: string;
                shirt: string;
                trim: string;
            };
            planner: {
                title: string;
                shirt: string;
                trim: string;
            };
            reviewer: {
                title: string;
                shirt: string;
                trim: string;
            };
            worker: {
                title: string;
                shirt: string;
                trim: string;
            };
            tester: {
                title: string;
                shirt: string;
                trim: string;
            };
            writer: {
                title: string;
                shirt: string;
                trim: string;
            };
            ceo: {
                title: string;
                shirt: string;
                trim: string;
            };
            cto: {
                title: string;
                shirt: string;
                trim: string;
            };
            cpo: {
                title: string;
                shirt: string;
                trim: string;
            };
            programmer: {
                title: string;
                shirt: string;
                trim: string;
            };
            designer: {
                title: string;
                shirt: string;
                trim: string;
            };
            counselor: {
                title: string;
                shirt: string;
                trim: string;
            };
            hr: {
                title: string;
                shirt: string;
                trim: string;
            };
        };
    };
    props: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        types: {
            rug: {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: never[];
                renderer: string;
            };
            door: {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            "restroom-door": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            window: {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: never[];
                renderer: string;
            };
            "office-clock": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: never[];
                renderer: string;
            };
            "boss-desk": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: never[];
                renderer: string;
            };
            "lounge-sofa": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            dumbbell: {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: never[];
                renderer: string;
            };
            workstation: {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            whiteboard: {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            "phone-table": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            "archive-cabinet": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            "server-rack": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            "coffee-machine": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            "water-cooler": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            "meeting-table": {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: string[];
                renderer: string;
            };
            plant: {
                size: {
                    width: number;
                    height: number;
                };
                capabilities: never[];
                renderer: string;
            };
        };
    };
    npcs: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        entries: ({
            id: string;
            name: string;
            role: string;
            title: string;
            spawn: string;
            pose: string;
            appearance: {
                skin: string;
                hair: string;
                shirt: string;
                trim: string;
                badge: string;
            };
        } | {
            id: string;
            name: string;
            role: string;
            title: string;
            spawn: string;
            appearance: {
                skin: string;
                hair: string;
                shirt: string;
                trim: string;
                badge: string;
            };
            pose?: undefined;
        })[];
    };
    lifeActivities: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        entries: ({
            id: string;
            name: string;
            participant: {
                kind: string;
                roles: string[];
                states?: undefined;
                minAgents?: undefined;
            };
            requires: {
                capability: string;
            }[];
            interruptible: boolean;
            initialDelayMs: number[];
            cooldownMs: number[];
            steps: ({
                target: string;
                durationMs: number;
                pose: string;
                bubble: string;
            } | {
                target: string;
                durationMs: number;
                pose: string;
                bubble?: undefined;
            })[];
            onlyWhenSessionIdle?: undefined;
            startBubble?: undefined;
        } | {
            id: string;
            name: string;
            participant: {
                kind: string;
                roles: string[];
                states?: undefined;
                minAgents?: undefined;
            };
            requires: never[];
            interruptible: boolean;
            initialDelayMs: number[];
            cooldownMs: number[];
            steps: ({
                target: string;
                personIndex: number;
                durationMs: number;
                pose: string;
                bubble: string;
                particle: string;
            } | {
                target: string;
                durationMs: number;
                pose: string;
                personIndex?: undefined;
                bubble?: undefined;
                particle?: undefined;
            })[];
            onlyWhenSessionIdle?: undefined;
            startBubble?: undefined;
        } | {
            id: string;
            name: string;
            participant: {
                kind: string;
                states: string[];
                minAgents: number;
                roles?: undefined;
            };
            requires: {
                capability: string;
            }[];
            onlyWhenSessionIdle: boolean;
            interruptible: boolean;
            startBubble: string;
            initialDelayMs: number[];
            cooldownMs: number[];
            steps: {
                target: string;
                targets: string[];
                durationMs: number;
                pose: string;
                bubbles: string[];
            }[];
        } | {
            id: string;
            name: string;
            participant: {
                kind: string;
                roles: string[];
                states: string[];
                minAgents: number;
            };
            requires: {
                capability: string;
            }[];
            onlyWhenSessionIdle: boolean;
            interruptible: boolean;
            startBubble: string;
            initialDelayMs: number[];
            cooldownMs: number[];
            steps: {
                target: string;
                targets: string[];
                durationMs: number;
                pose: string;
                bubbles: string[];
            }[];
        } | {
            id: string;
            name: string;
            participant: {
                kind: string;
                roles: string[];
                states: string[];
                minAgents?: undefined;
            };
            requires: {
                capability: string;
            }[];
            onlyWhenSessionIdle: boolean;
            interruptible: boolean;
            startBubble: string;
            initialDelayMs: number[];
            cooldownMs: number[];
            steps: {
                target: string;
                durationMs: number;
                pose: string;
                bubble: string;
            }[];
        } | {
            id: string;
            name: string;
            participant: {
                kind: string;
                roles: string[];
                states?: undefined;
                minAgents?: undefined;
            };
            requires: never[];
            interruptible: boolean;
            initialDelayMs: number[];
            cooldownMs: number[];
            steps: ({
                target: string;
                durationMs: number;
                pose: string;
                bubble: string;
                particle: string;
            } | {
                target: string;
                durationMs: number;
                pose: string;
                bubble?: undefined;
                particle?: undefined;
            })[];
            onlyWhenSessionIdle?: undefined;
            startBubble?: undefined;
        })[];
    };
    atmosphere: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        contract: string;
        styleOverrides: {
            css: {};
        };
        windowScene: string;
        ambientEffects: never[];
        audio: null;
    };
    environment: {
        schemaVersion: number;
        kind: string;
        id: string;
        name: string;
        version: string;
        engine: {
            min: string;
        };
        render: {
            dynamicTime: boolean;
            dynamicWeather: boolean;
        };
        clock: {
            mode: string;
            phases: {
                id: string;
                start: string;
            }[];
            preview: {
                enabled: boolean;
                startTime: string;
                durationMs: number;
            };
        };
        weather: {
            source: string;
            fallback: string;
            allowedConditions: string[];
        };
        lighting: {
            enabled: boolean;
            activePhases: string[];
        };
        npcSchedule: {
            enabled: boolean;
            defaultShift: {
                start: string;
                end: string;
                endLatest: string;
            };
            roleOverrides: {};
            labels: {
                arrival: string;
                departure: string;
            };
        };
    };
    agentProfile: {
        template: string;
        appearance: {};
    };
};
declare global {
    interface Window {
        AgentLiveI18n: unknown;
        AgentLiveClientKind: string;
        OfficeContent: unknown;
        SceneLimits: unknown;
        Office: unknown;
        OfficeEnvironment: unknown;
        Sprites: unknown;
        AgentLiveSubscribe: (listener: (event: any) => void) => () => void;
        AgentLiveGetSnapshot: () => Promise<any>;
        AgentLiveInitialContent?: typeof fallbackContent;
        AgentLiveInitialLocale?: string;
    }
}
export {};
