import { Body, Controller, Delete, Get, Param, Post, HttpCode, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';
import { GradePrisma } from './grade.prisma';
import { FinalyGrade, Grade } from '@core/index';

@Controller('grades')
export class GradeController {
  constructor(private readonly repo: GradePrisma) { }

  // Salvar ou criar uma grade
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async salvarGrade(@Body() grade: Omit<Grade, 'createdAt' | 'updatedAt'>): Promise<Grade> {
    try {
      return await this.repo.salvar(grade);
    } catch (error) {
      throw new BadRequestException('Erro ao salvar a grade: ' + error.message);
    }
  }

  // Finalizar uma grade
  @Post('/finalizar')
  @HttpCode(HttpStatus.OK)
  async finalizarGrade(@Body() finalyGrade: FinalyGrade): Promise<Grade> {
    try {
      if (!finalyGrade.id) {
        throw new BadRequestException('O ID da grade é obrigatório.');
      }
      return await this.repo.finalizarGrade(finalyGrade);
    } catch (error) {
      throw new BadRequestException('Erro ao finalizar a grade: ' + error.message);
    }
  }

  @Post('/alterdespachadas')
  @HttpCode(HttpStatus.OK)
  async finalizarGrades(@Body() ids: number[]): Promise<number[]> {
    try {
      if (!ids || ids.length === 0) {
        throw new BadRequestException('O array de IDs é obrigatório e não pode estar vazio.');
      }      
      const idsAlterados = await this.repo.atualizarStatusParaDespachada(ids);
      if (idsAlterados.length === 0) {
        throw new NotFoundException('Nenhuma grade com status EXPEDIDA encontrada para alteração.');
      }
      return idsAlterados; 
    } catch (error) {
      throw new BadRequestException('Erro ao finalizar as grades: ' + error.message);
    }
  }

  @Post('/ajustar/:id')
  @HttpCode(HttpStatus.OK)
  async ajustarGrade(@Param('id') id: string): Promise<Grade | null> {
    try {
      if (!id) {
        throw new BadRequestException('O ID da grade é obrigatório.');
      }
      const novaGrade = await this.repo.replicarGrade(+id);
      if (!novaGrade) {
        throw new NotFoundException('Nenhuma nova grade foi criada. Verifique os dados da grade original.');
      }
      return novaGrade;
    } catch (error) {
      throw new BadRequestException('Erro ao ajustar a grade: ' + error.message);
    }
  }

  // Obter todas as grades
  @Get()
  async obterGrades(): Promise<Grade[]> {
    return this.repo.obter();
  }

  // Obter uma grade específica pelo ID
  @Get(':id')
  async obterGrade(@Param('id') id: string): Promise<Grade | null> {
    const grade = await this.repo.obterPorId(+id);
    if (!grade) {
      throw new NotFoundException(`Grade com ID ${id} não encontrada.`);
    }
    return grade;
  }

  // Excluir uma grade específica pelo ID
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async excluirGrade(@Param('id') id: string): Promise<void> {
    const grade = await this.repo.obterPorId(+id);
    if (!grade) {
      throw new NotFoundException(`Grade com ID ${id} não encontrada.`);
    }
    try {
      await this.repo.excluir(+id);
    } catch (error) {
      throw new BadRequestException('Erro ao excluir a grade: ' + error.message);
    }
  }
}
