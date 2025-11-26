import ItensCaixaAjuste from "./ItensCaixaAjuste";

export default interface CaixaAjuste {
    id: number,
    caixaNumber: string,
    gradeId: number,
    status: string,
    qtyCaixa: number,
    createdAt: string,
    updatedAt: string,
    projeto: string,
    projetoId: number;
    escola: string,
    escolaNumero: string,
    escolaId: number,
    itens: ItensCaixaAjuste[],
}
