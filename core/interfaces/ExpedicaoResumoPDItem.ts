export default interface ExpedicaoResumoPDItem {
    data: string | null;
    item: string;
    genero: string;
    tamanho: string;
    previsto: number;
    expedido: number;
    escola?: string;              // Nome da escola (opcional)
    tipoLinha?: 'item' | 'escola' | 'total_escola' | 'total_data' | 'total_geral' | 'status';  // Tipo da linha (opcional)
}
