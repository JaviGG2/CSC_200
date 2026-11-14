"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ quiet: true });
const neon_1 = require("./neon");
// Crea/verifica en Neon todas las tablas que usa el sistema.
async function main() {
    const resultado = await (0, neon_1.inicializarEsquemaNeon)();
    console.log(resultado.mensaje);
    if (!resultado.configurado || !resultado.ok) {
        process.exitCode = 1;
    }
}
main();
//# sourceMappingURL=neon-init.js.map