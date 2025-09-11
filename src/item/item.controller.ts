import { Body, Controller, Delete, Get, Param, Post, HttpCode, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { ItemPrisma } from './item.prisma';
import { Item } from '@core/index';

@Controller('itens')
export class ItemController {
  constructor(private readonly repo: ItemPrisma) {}

  // Salvar ou criar um Item
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async salvarItem(@Body() item: Omit<Item, 'createdAt' | 'updatedAt'>): Promise<Item> {
    try {
      return await this.repo.salvar(item);
    } catch (error) {
      throw new BadRequestException('Erro ao salvar o item: ' + error.message);
    }
  }

  // Obter todos os itens
  @Get()
  async obterItens(): Promise<Item[]> {
    return this.repo.obter();
  }

  // Obter fabrics
  @Get('fabrics')
  async obterFabrics(): Promise<any[]> {
    const fabrics = await this.repo.getExitFabrics();
    if (!fabrics) {
      throw new NotFoundException(`Não há dados para os parãmetros pesquisados.`);
    }
    return fabrics;
  }

  // Obter um item específico pelo ID
  @Get(':id')
  async obterItem(@Param('id') id: string): Promise<Item> {
    const item = await this.repo.obterPorId(+id);
    if (!item) {
      throw new NotFoundException(`Item com ID ${id} não encontrado.`);
    }
    return item;
  }

  // Excluir um item específico pelo ID
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // Indica que não há conteúdo após a exclusão
  async excluirItem(@Param('id') id: string): Promise<void> {
    const item = await this.repo.obterPorId(+id);
    if (!item) {
      throw new NotFoundException(`Item com ID ${id} não encontrado.`);
    }
    try {
      await this.repo.excluir(+id);
    } catch (error) {
      throw new BadRequestException('Erro ao excluir o item: ' + error.message);
    }
  }
}
